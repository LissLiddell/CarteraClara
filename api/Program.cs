using System.Globalization;
using System.Threading.RateLimiting;
using CarteraClara.Api;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
var connection = builder.Configuration.GetConnectionString("CarteraClara")
    ?? throw new InvalidOperationException("Falta ConnectionStrings__CarteraClara. Ejecuta npm run db:setup y npm run db:up.");
builder.Services.AddDbContext<CarteraDb>(options => options.UseSqlServer(connection));
builder.Services.AddRateLimiter(options =>
{
    // A shared daily ceiling protects the demo even if requests come from many IPs.
    // App restarts reset this in-memory counter; the cloud free-tier quotas remain the cost backstop.
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        context.Request.Path.StartsWithSegments("/api") && !context.Request.Path.StartsWithSegments("/api/health")
            ? RateLimitPartition.GetFixedWindowLimiter("demo-daily", _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Environment.IsDevelopment() ? int.MaxValue : 1000,
                Window = TimeSpan.FromDays(1),
                QueueLimit = 0,
                AutoReplenishment = true
            })
            : RateLimitPartition.GetNoLimiter("public-static"));
    options.AddPolicy("demo-api", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = builder.Environment.IsDevelopment() ? int.MaxValue : 30,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, _) =>
    {
        context.HttpContext.Response.ContentType = "application/json";
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            message = "La demo llegó a su límite temporal de solicitudes. Inténtalo más tarde."
        });
    };
});

var app = builder.Build();
await InitializeDatabase(app);
app.UseRouting();
app.UseRateLimiter();

// Liveness does not query SQL: automated health probes cannot consume database quota.
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/api/state", async (string actor, string? asOf, CarteraDb db) =>
{
    if (!ActorCatalog.All.TryGetValue(actor, out var operatorInfo)) return Results.BadRequest(new { message = "Selecciona un rol válido." });
    var today = BusinessToday();
    var asOfDate = today;
    if (asOf is not null && (!DateOnly.TryParseExact(asOf, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out asOfDate) || asOfDate < today))
        return Results.BadRequest(new { message = "Elige una fecha de consulta válida, igual o posterior a hoy." });

    var accounts = await db.Accounts.AsNoTracking().AsSplitQuery()
        .Include(x => x.Contacts).Include(x => x.Promises)
        .Include(x => x.Payments).Include(x => x.Events)
        .OrderBy(x => x.Id).ToListAsync();

    var visible = accounts.Where(account => operatorInfo.Role switch
    {
        "agent" => account.AssignedTo == operatorInfo.Id,
        "finance" => account.AssignedTo is not null,
        _ => true
    }).ToList();

    return Results.Ok(new
    {
        schemaVersion = 2,
        version = accounts.Sum(x => x.Revision),
        todayDate = today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        asOfDate = asOfDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        isDatePreview = asOfDate != today,
        demoToolsEnabled = app.Environment.IsDevelopment(),
        selectedAccountId = visible.FirstOrDefault()?.Id,
        accounts = visible.Select(account => new
        {
            account.Id,
            account.Client,
            account.Concept,
            account.OpeningBalanceCents,
            account.BalanceCents,
            account.AssignedTo,
            contacts = account.Contacts.OrderBy(x => x.Sequence).Select(x => new { x.Id, x.Sequence, x.At, x.ActorId, x.Outcome, x.Disposition, x.Note }),
            promises = account.Promises.OrderBy(x => x.Sequence).Select(x => new
            {
                x.Id, x.Sequence, x.AmountCents, x.CoveredCents, x.DueDate, x.NextFollowUpDate, x.Status, x.CreatedAt, x.ActorId,
                remainingCents = x.AmountCents - x.CoveredCents,
                isOverdue = x.DueDate is DateOnly dueDate && dueDate < asOfDate && x.CoveredCents < x.AmountCents
            }),
            payments = account.Payments.OrderBy(x => x.Sequence).Select(x => new { x.Id, x.Sequence, x.At, x.ActorId, x.Reference, x.AmountCents, x.AppliedToPromiseCents, x.PromiseId }),
            events = account.Events.OrderByDescending(x => x.Sequence).Select(x => new { x.Id, x.Sequence, x.Type, x.Kind, x.ActorId, x.ActorName, x.At, x.Detail })
        })
    });
}).RequireRateLimiting("demo-api");

app.MapPost("/api/actions", async (ActionRequest action, CarteraDb db) =>
{
    if (!ActorCatalog.All.TryGetValue(action.ActorKey, out var actor)) return Results.BadRequest(new { message = "Selecciona un rol válido." });
    if (string.IsNullOrWhiteSpace(action.AccountId)) return Results.BadRequest(new { message = "Selecciona una cuenta válida." });

    try
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        var account = await db.Accounts
            .Include(x => x.Contacts).Include(x => x.Promises)
            .Include(x => x.Payments).Include(x => x.Events)
            .SingleOrDefaultAsync(x => x.Id == action.AccountId);
        if (account is null) throw new RuleException("Selecciona una cuenta válida.");

        var at = DateTimeOffset.UtcNow;
        var sequence = account.Revision + 1;
        var eventId = $"EV-{Guid.NewGuid():N}"[..20].ToUpperInvariant();
        var type = action.Type?.ToUpperInvariant() ?? "";
        string detail;
        string? kind = null;

        switch (type)
        {
            case "ASSIGN":
            {
                RequireRole(actor, "supervisor");
                if (account.BalanceCents == 0) throw new RuleException("La cuenta está liquidada; selecciona otra cuenta para asignar.");
                if (account.Contacts.Count > 0) throw new RuleException("La cuenta ya tiene contactos; una transferencia requiere otro flujo.");
                if (!ActorCatalog.All.TryGetValue(action.AgentId ?? "", out var agent) || agent.Role != "agent")
                    throw new RuleException("Selecciona un agente válido.");
                if (account.AssignedTo == agent.Id) throw new RuleException("La cuenta ya está asignada a ese agente.");
                account.AssignedTo = agent.Id;
                detail = $"Asignó la cuenta a {agent.Name}.";
                break;
            }
            case "CONTACT":
            {
                RequireAssigned(account, actor);
                if (account.BalanceCents == 0) throw new RuleException("La cuenta ya está liquidada; no requiere más seguimiento.");
                if (action.Outcome is not ("CONNECTED" or "NO_ANSWER")) throw new RuleException("Selecciona un resultado de contacto válido.");
                var note = RequiredText(action.Note, "La nota de contacto", 240);
                var disposition = action.Disposition;
                if (action.Outcome == "NO_ANSWER")
                {
                    if (disposition is not null) throw new RuleException("Un intento sin respuesta no puede tener acuerdo de pago.");
                }
                else if (disposition is not ("DATED_PROMISE" or "UNDATED_PROMISE" or "DATE_CONFIRMED" or "FOLLOW_UP" or "NO_AGREEMENT"))
                {
                    throw new RuleException("Selecciona cómo terminó el contacto efectivo.");
                }
                var createsPromise = disposition is "DATED_PROMISE" or "UNDATED_PROMISE";
                var existingPromise = ActivePromise(account);
                long promiseAmount = 0;
                DateOnly? promiseDueDate = null;
                if (createsPromise)
                {
                    if (existingPromise is not null) throw new RuleException("Ya existe una promesa abierta para esta cuenta.");
                    promiseAmount = PositiveCents(action.AmountCents, "La promesa");
                    if (promiseAmount > account.BalanceCents) throw new RuleException("La promesa no puede superar el saldo pendiente.");
                    if (disposition == "DATED_PROMISE")
                    {
                        if (!DateOnly.TryParseExact(action.DueDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDueDate))
                            throw new RuleException("Selecciona una fecha válida para la promesa.");
                        if (parsedDueDate <= BusinessToday()) throw new RuleException("La fecha de promesa debe ser futura.");
                        promiseDueDate = parsedDueDate;
                    }
                    else if (!string.IsNullOrWhiteSpace(action.DueDate)) throw new RuleException("La promesa sin fecha no debe incluir una fecha de pago.");
                }
                else if (disposition == "DATE_CONFIRMED")
                {
                    if (existingPromise is null || existingPromise.DueDate is not null)
                        throw new RuleException("Solo puedes acordar una fecha para un compromiso abierto sin fecha.");
                    if (action.AmountCents is not null) throw new RuleException("Este contacto solo acuerda la fecha; el monto original no cambia.");
                    if (!DateOnly.TryParseExact(action.DueDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedDueDate)
                        || parsedDueDate <= BusinessToday()) throw new RuleException("La fecha acordada debe ser futura.");
                    promiseDueDate = parsedDueDate;
                }
                else if (action.AmountCents is not null || !string.IsNullOrWhiteSpace(action.DueDate))
                    throw new RuleException("Este resultado de contacto no incluye una promesa de pago.");

                account.Contacts.Add(new Contact
                {
                    Id = $"CT-{eventId}", AccountId = account.Id, Sequence = sequence,
                    At = at, ActorId = actor.Id, Outcome = action.Outcome, Disposition = disposition, Note = note
                });
                if (createsPromise)
                {
                    account.Promises.Add(new PaymentPromise
                    {
                        Id = $"PR-{eventId}", AccountId = account.Id, Sequence = sequence,
                        AmountCents = promiseAmount, CoveredCents = 0, DueDate = promiseDueDate,
                        Status = "PENDING", CreatedAt = at, ActorId = actor.Id
                    });
                    kind = disposition;
                    detail = disposition == "DATED_PROMISE"
                        ? $"Contacto efectivo; acordó promesa por {Money(promiseAmount)} para {promiseDueDate:yyyy-MM-dd}. {note}"
                        : $"Contacto efectivo; acordó promesa por {Money(promiseAmount)} sin fecha de pago. {note}";
                    break;
                }
                if (disposition == "DATE_CONFIRMED")
                {
                    existingPromise!.DueDate = promiseDueDate;
                    kind = disposition;
                    detail = $"Contacto efectivo; acordó fecha de pago {promiseDueDate:yyyy-MM-dd} para el compromiso {existingPromise.Id} por {Money(existingPromise.AmountCents)}. {note}";
                    break;
                }
                var overduePromise = existingPromise;
                if (overduePromise?.DueDate is DateOnly overdueDate && overdueDate < BusinessToday())
                {
                    kind = "OVERDUE_FOLLOWUP";
                    detail = $"Seguimiento de promesa vencida {overduePromise.Id} (faltan {Money(overduePromise.AmountCents - overduePromise.CoveredCents)}): "
                        + (action.Outcome == "CONNECTED" ? $"{ContactDispositionText(disposition)}. {note}" : $"sin respuesta. {note}");
                }
                else
                {
                    kind = disposition;
                    detail = action.Outcome == "CONNECTED" ? $"Contacto efectivo; {ContactDispositionText(disposition)}. {note}" : $"Sin respuesta: {note}";
                }
                break;
            }
            case "SCHEDULE_FOLLOW_UP":
            {
                RequireAssigned(account, actor);
                var promise = ActivePromise(account);
                var today = BusinessToday();
                if (promise?.DueDate is not DateOnly dueDate || dueDate >= today)
                    throw new RuleException("Solo puedes agendar seguimiento de una promesa realmente vencida y no cubierta.");
                if (!DateOnly.TryParseExact(action.NextFollowUpDate, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var nextDate)
                    || nextDate <= today)
                    throw new RuleException("La nueva fecha de seguimiento debe ser posterior a hoy.");
                if (promise.NextFollowUpDate == nextDate)
                    throw new RuleException("Ese seguimiento ya está agendado para esa fecha.");
                var previous = promise.NextFollowUpDate;
                promise.NextFollowUpDate = nextDate;
                detail = previous is null
                    ? $"Agendó seguimiento de la promesa vencida {promise.Id} para {nextDate:yyyy-MM-dd}. La fecha original de pago {dueDate:yyyy-MM-dd} no cambió."
                    : $"Reprogramó seguimiento de la promesa vencida {promise.Id} de {previous:yyyy-MM-dd} a {nextDate:yyyy-MM-dd}. La fecha original de pago no cambió.";
                break;
            }
            case "PAYMENT":
            {
                RequireRole(actor, "finance");
                if (account.AssignedTo is null) throw new RuleException("La cuenta aún no está asignada; finanzas no puede registrar un abono.");
                var amount = PositiveCents(action.AmountCents, "El abono");
                if (amount > account.BalanceCents) throw new RuleException("El abono no puede superar el saldo pendiente.");
                var reference = RequiredText(action.Reference, "La referencia", 40);
                var referenceKey = reference.ToUpperInvariant();
                if (await db.Payments.AnyAsync(x => x.ReferenceKey == referenceKey))
                    throw new DuplicateReferenceException();
                var promise = ActivePromise(account);
                var applied = promise is null ? 0 : Math.Min(amount, promise.AmountCents - promise.CoveredCents);
                var independent = amount - applied;
                var closedFollowUp = false;
                if (promise is not null)
                {
                    promise.CoveredCents += applied;
                    promise.Status = promise.CoveredCents == promise.AmountCents ? "FULFILLED" : "PARTIAL";
                    if (promise.Status == "FULFILLED" && promise.NextFollowUpDate is not null)
                    {
                        promise.NextFollowUpDate = null;
                        closedFollowUp = true;
                    }
                }
                account.BalanceCents -= amount;
                account.Payments.Add(new Payment
                {
                    Id = $"PM-{eventId}", AccountId = account.Id, Sequence = sequence,
                    At = at, ActorId = actor.Id, Reference = reference, ReferenceKey = referenceKey,
                    AmountCents = amount, AppliedToPromiseCents = applied, PromiseId = promise?.Id
                });
                if (promise is null)
                {
                    kind = "INDEPENDENT_PAYMENT";
                    detail = $"Confirmó abono independiente {reference} por {Money(amount)} en la cuenta {account.Id}; sin promesa asociada. Saldo pendiente: {Money(account.BalanceCents)}.";
                }
                else if (independent > 0)
                {
                    kind = "MIXED_PAYMENT";
                    detail = $"Confirmó abono {reference} por {Money(amount)}: {Money(applied)} a la promesa {promise.Id} y {Money(independent)} como abono adicional sin promesa. Saldo pendiente: {Money(account.BalanceCents)}.";
                }
                else
                {
                    kind = "PROMISE_PAYMENT";
                    detail = $"Confirmó abono {reference} por {Money(amount)} aplicado a la promesa {promise.Id}. Saldo pendiente: {Money(account.BalanceCents)}.";
                }
                if (closedFollowUp) detail += " Se cerró el seguimiento agendado al cumplirse la promesa.";
                break;
            }
            default:
                throw new RuleException("Acción no reconocida.");
        }

        account.Revision = sequence;
        account.Events.Add(new LedgerEvent
        {
            Id = eventId, AccountId = account.Id, Sequence = sequence, Type = type, Kind = kind,
            ActorId = actor.Id, ActorName = actor.Name, At = at, Detail = detail
        });
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(new { kind });
    }
    catch (DuplicateReferenceException)
    {
        return Results.Conflict(new { message = "Esa referencia ya fue registrada; no dupliques el abono." });
    }
    catch (RuleException error)
    {
        return Results.BadRequest(new { message = error.Message });
    }
    catch (DbUpdateConcurrencyException)
    {
        return Results.Conflict(new { message = "Otra persona actualizó la cuenta. Recarga para ver el saldo antes de continuar." });
    }
    catch (DbUpdateException error) when (error.InnerException is SqlException { Number: 2601 or 2627 })
    {
        return error.InnerException!.Message.Contains("IX_Payments_ReferenceKey", StringComparison.Ordinal)
            ? Results.Conflict(new { message = "Esa referencia ya fue registrada; no dupliques el abono." })
            : Results.Conflict(new { message = "Otra persona actualizó la cuenta. Recarga antes de continuar." });
    }
}).RequireRateLimiting("demo-api");

if (app.Environment.IsDevelopment())
{
    app.MapPost("/api/demo/reset", async (CarteraDb db) =>
    {
        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Payments.ExecuteDeleteAsync();
        await db.Promises.ExecuteDeleteAsync();
        await db.Contacts.ExecuteDeleteAsync();
        await db.Events.ExecuteDeleteAsync();
        await db.Accounts.ExecuteDeleteAsync();
        SeedData.AddAccounts(db);
        db.Accounts.Add(CreateOverdueAccount());
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(new { message = "Cartera de ejemplo reiniciada en SQL Server." });
    });
}

var files = new Dictionary<string, string>
{
    ["app.js"] = "app.js", ["domain.js"] = "domain.js", ["styles.css"] = "styles.css"
};
app.MapGet("/", (HttpContext context) =>
{
    context.Response.Headers.CacheControl = "no-store";
    return Results.File(Path.Combine(AppContext.BaseDirectory, "index.html"), "text/html");
});
app.MapGet("/{asset}", (string asset, HttpContext context) =>
{
    if (!files.TryGetValue(asset, out var file)) return Results.NotFound();
    var contentType = file.EndsWith(".js") ? "text/javascript" : file.EndsWith(".css") ? "text/css" : "text/html";
    context.Response.Headers.CacheControl = "no-store";
    return Results.File(Path.Combine(AppContext.BaseDirectory, file), contentType);
});

app.Run();

static async Task InitializeDatabase(WebApplication app)
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<CarteraDb>();
    for (var attempt = 1; ; attempt++)
    {
        try
        {
            await db.Database.MigrateAsync();
            if (!await db.Accounts.AnyAsync()) SeedData.AddAccounts(db);
            if (!await db.Accounts.AnyAsync(x => x.Id == "CC-107")) db.Accounts.Add(CreateOverdueAccount());
            if (db.ChangeTracker.HasChanges()) await db.SaveChangesAsync();
            return;
        }
        catch (SqlException) when (attempt < 16)
        {
            app.Logger.LogInformation("Esperando SQL Server (intento {Attempt}/16)...", attempt);
            await Task.Delay(TimeSpan.FromSeconds(3));
        }
    }
}

static Account CreateOverdueAccount()
{
    const string id = "CC-107";
    var createdAt = DateTimeOffset.UtcNow.AddDays(-4);
    var dueDate = BusinessToday().AddDays(-1);
    return new Account
    {
        Id = id, Client = "Comercial Arce", Concept = "Cuenta ficticia para practicar seguimiento vencido",
        OpeningBalanceCents = 350_000, BalanceCents = 350_000, AssignedTo = "lia", Revision = 2,
        Contacts = [new Contact
        {
            Id = "CT-OVERDUE-001", AccountId = id, Sequence = 1, At = createdAt,
            ActorId = "lia", Outcome = "CONNECTED", Disposition = "DATED_PROMISE", Note = "Se acordó una fecha de pago en esta simulación histórica."
        }],
        Promises = [new PaymentPromise
        {
            Id = "PR-OVERDUE-002", AccountId = id, Sequence = 2, AmountCents = 150_000,
            CoveredCents = 0, DueDate = dueDate, Status = "PENDING", CreatedAt = createdAt.AddMinutes(10), ActorId = "lia"
        }],
        Events = [
            new LedgerEvent
            {
                Id = "EV-OVERDUE-001", AccountId = id, Sequence = 1, Type = "CONTACT", ActorId = "lia",
                ActorName = "Lía Torres", At = createdAt, Detail = "Contacto efectivo: se acordó una fecha de pago en esta simulación histórica."
            },
            new LedgerEvent
            {
                Id = "EV-OVERDUE-002", AccountId = id, Sequence = 2, Type = "PROMISE", ActorId = "lia",
                ActorName = "Lía Torres", At = createdAt.AddMinutes(10), Detail = $"Registró promesa por {Money(150_000)} para {dueDate:yyyy-MM-dd}."
            }
        ]
    };
}

static void RequireRole(Operator actor, string role)
{
    if (actor.Role != role) throw new RuleException("Tu rol no puede realizar esta acción.");
}

static void RequireAssigned(Account account, Operator actor)
{
    RequireRole(actor, "agent");
    if (account.AssignedTo != actor.Id) throw new RuleException("Solo el agente asignado puede atender esta cuenta.");
}

static PaymentPromise? ActivePromise(Account account) => account.Promises
    .OrderBy(x => x.Sequence).FirstOrDefault(x => x.Status is "PENDING" or "PARTIAL");

static DateOnly BusinessToday() => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(
    DateTimeOffset.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("America/Mexico_City")).DateTime);

static long PositiveCents(long? amount, string label)
{
    if (amount is null or <= 0) throw new RuleException($"{label} debe ser mayor a cero y expresarse en centavos enteros.");
    return amount.Value;
}

static string RequiredText(string? value, string label, int max)
{
    var trimmed = value?.Trim();
    if (string.IsNullOrEmpty(trimmed) || trimmed.Length > max)
        throw new RuleException($"{label} es obligatorio y debe tener máximo {max} caracteres.");
    return trimmed;
}

static string Money(long cents) => (cents / 100m).ToString("C", CultureInfo.GetCultureInfo("es-MX"));

static string ContactDispositionText(string? disposition) => disposition switch
{
    "FOLLOW_UP" => "requiere seguimiento",
    "NO_AGREEMENT" => "no se alcanzó un acuerdo",
    _ => "se registró el resultado"
};

public sealed record Operator(string Id, string Name, string Role);
public static class ActorCatalog
{
    public static readonly Dictionary<string, Operator> All = new()
    {
        ["supervisor"] = new("elena", "Elena Ríos", "supervisor"),
        ["lia"] = new("lia", "Lía Torres", "agent"),
        ["marco"] = new("marco", "Marco Gil", "agent"),
        ["finance"] = new("vera", "Vera Solís", "finance")
    };
}
public sealed class ActionRequest
{
    public string ActorKey { get; set; } = "";
    public string Type { get; set; } = "";
    public string AccountId { get; set; } = "";
    public string? AgentId { get; set; }
    public string? Outcome { get; set; }
    public string? Disposition { get; set; }
    public string? Note { get; set; }
    public long? AmountCents { get; set; }
    public string? DueDate { get; set; }
    public string? NextFollowUpDate { get; set; }
    public string? Reference { get; set; }
}
public sealed class RuleException(string message) : Exception(message);
public sealed class DuplicateReferenceException : Exception { }
