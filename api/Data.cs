using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace CarteraClara.Api;

public sealed class CarteraDb(DbContextOptions<CarteraDb> options) : DbContext(options)
{
    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Contact> Contacts => Set<Contact>();
    public DbSet<PaymentPromise> Promises => Set<PaymentPromise>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<LedgerEvent> Events => Set<LedgerEvent>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<Account>(entity =>
        {
            entity.ToTable("Accounts", table => table.HasCheckConstraint(
                "CK_Accounts_Balance", "[BalanceCents] >= 0 AND [BalanceCents] <= [OpeningBalanceCents]"));
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasMaxLength(16);
            entity.Property(x => x.Client).HasMaxLength(120);
            entity.Property(x => x.Concept).HasMaxLength(200);
            entity.Property(x => x.AssignedTo).HasMaxLength(20);
            entity.Property(x => x.RowVersion).IsRowVersion();
            entity.HasIndex(x => x.AssignedTo);
            entity.HasMany(x => x.Contacts).WithOne().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.Promises).WithOne().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.Payments).WithOne().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
            entity.HasMany(x => x.Events).WithOne().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Cascade);
        });
        model.Entity<Contact>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasMaxLength(24);
            entity.Property(x => x.AccountId).HasMaxLength(16);
            entity.Property(x => x.ActorId).HasMaxLength(20);
            entity.Property(x => x.Outcome).HasMaxLength(20);
            entity.Property(x => x.Disposition).HasMaxLength(24);
            entity.Property(x => x.Note).HasMaxLength(240);
            entity.HasIndex(x => new { x.AccountId, x.Sequence }).IsUnique();
        });
        model.Entity<PaymentPromise>(entity =>
        {
            entity.ToTable("Promises", table => table.HasCheckConstraint(
                "CK_Promises_Covered", "[AmountCents] > 0 AND [CoveredCents] >= 0 AND [CoveredCents] <= [AmountCents]"));
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasMaxLength(24);
            entity.Property(x => x.AccountId).HasMaxLength(16);
            entity.Property(x => x.ActorId).HasMaxLength(20);
            entity.Property(x => x.Status).HasMaxLength(20);
            entity.HasIndex(x => new { x.AccountId, x.Sequence }).IsUnique();
        });
        model.Entity<Payment>(entity =>
        {
            entity.ToTable("Payments", table => table.HasCheckConstraint(
                "CK_Payments_Amounts", "[AmountCents] > 0 AND [AppliedToPromiseCents] >= 0 AND [AppliedToPromiseCents] <= [AmountCents]"));
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasMaxLength(24);
            entity.Property(x => x.AccountId).HasMaxLength(16);
            entity.Property(x => x.ActorId).HasMaxLength(20);
            entity.Property(x => x.Reference).HasMaxLength(40);
            entity.Property(x => x.ReferenceKey).HasMaxLength(40);
            entity.Property(x => x.PromiseId).HasMaxLength(24);
            entity.HasOne<PaymentPromise>().WithMany().HasForeignKey(x => x.PromiseId).OnDelete(DeleteBehavior.NoAction);
            entity.HasIndex(x => x.ReferenceKey).IsUnique();
            entity.HasIndex(x => new { x.AccountId, x.Sequence }).IsUnique();
        });
        model.Entity<LedgerEvent>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasMaxLength(24);
            entity.Property(x => x.AccountId).HasMaxLength(16);
            entity.Property(x => x.Type).HasMaxLength(20);
            entity.Property(x => x.Kind).HasMaxLength(30);
            entity.Property(x => x.ActorId).HasMaxLength(20);
            entity.Property(x => x.ActorName).HasMaxLength(100);
            entity.Property(x => x.Detail).HasMaxLength(700);
            entity.HasIndex(x => new { x.AccountId, x.Sequence }).IsUnique();
        });
    }
}

public sealed class Account
{
    public string Id { get; set; } = "";
    public string Client { get; set; } = "";
    public string Concept { get; set; } = "";
    public long OpeningBalanceCents { get; set; }
    public long BalanceCents { get; set; }
    public string? AssignedTo { get; set; }
    public int Revision { get; set; }
    public byte[] RowVersion { get; set; } = [];
    public List<Contact> Contacts { get; set; } = [];
    public List<PaymentPromise> Promises { get; set; } = [];
    public List<Payment> Payments { get; set; } = [];
    public List<LedgerEvent> Events { get; set; } = [];
}

public sealed class Contact
{
    public string Id { get; set; } = "";
    public string AccountId { get; set; } = "";
    public int Sequence { get; set; }
    public DateTimeOffset At { get; set; }
    public string ActorId { get; set; } = "";
    public string Outcome { get; set; } = "";
    public string? Disposition { get; set; }
    public string Note { get; set; } = "";
}

public sealed class PaymentPromise
{
    public string Id { get; set; } = "";
    public string AccountId { get; set; } = "";
    public int Sequence { get; set; }
    public long AmountCents { get; set; }
    public long CoveredCents { get; set; }
    public DateOnly? DueDate { get; set; }
    public DateOnly? NextFollowUpDate { get; set; }
    public string Status { get; set; } = "PENDING";
    public DateTimeOffset CreatedAt { get; set; }
    public string ActorId { get; set; } = "";
}

public sealed class Payment
{
    public string Id { get; set; } = "";
    public string AccountId { get; set; } = "";
    public int Sequence { get; set; }
    public DateTimeOffset At { get; set; }
    public string ActorId { get; set; } = "";
    public string Reference { get; set; } = "";
    public string ReferenceKey { get; set; } = "";
    public long AmountCents { get; set; }
    public long AppliedToPromiseCents { get; set; }
    public string? PromiseId { get; set; }
}

public sealed class LedgerEvent
{
    public string Id { get; set; } = "";
    public string AccountId { get; set; } = "";
    public int Sequence { get; set; }
    public string Type { get; set; } = "";
    public string? Kind { get; set; }
    public string ActorId { get; set; } = "";
    public string ActorName { get; set; } = "";
    public DateTimeOffset At { get; set; }
    public string Detail { get; set; } = "";
}

public static class SeedData
{
    public static void AddAccounts(CarteraDb db)
    {
        db.Accounts.AddRange(
            new Account { Id = "CC-104", Client = "Estudio Bruma", Concept = "Servicios profesionales a crédito", OpeningBalanceCents = 1_250_000, BalanceCents = 1_250_000 },
            new Account { Id = "CC-105", Client = "Librería Jacaranda", Concept = "Suministro comercial a crédito", OpeningBalanceCents = 780_000, BalanceCents = 780_000 },
            new Account { Id = "CC-106", Client = "Taller Nube", Concept = "Mantenimiento de equipo a crédito", OpeningBalanceCents = 430_000, BalanceCents = 430_000 });
    }
}

public sealed class DesignTimeDbFactory : IDesignTimeDbContextFactory<CarteraDb>
{
    public CarteraDb CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<CarteraDb>()
            .UseSqlServer("Server=localhost;Database=CarteraClara;Trusted_Connection=True;TrustServerCertificate=True")
            .Options;
        return new CarteraDb(options);
    }
}
