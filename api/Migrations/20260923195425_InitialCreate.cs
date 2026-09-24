using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CarteraClara.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Accounts",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Client = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    Concept = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                    OpeningBalanceCents = table.Column<long>(type: "bigint", nullable: false),
                    BalanceCents = table.Column<long>(type: "bigint", nullable: false),
                    AssignedTo = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Accounts", x => x.Id);
                    table.CheckConstraint("CK_Accounts_Balance", "[BalanceCents] >= 0 AND [BalanceCents] <= [OpeningBalanceCents]");
                });

            migrationBuilder.CreateTable(
                name: "Contacts",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ActorId = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Outcome = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Note = table.Column<string>(type: "nvarchar(240)", maxLength: 240, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Contacts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Contacts_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Events",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    Type = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    ActorId = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ActorName = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    At = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    Detail = table.Column<string>(type: "nvarchar(700)", maxLength: 700, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Events", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Events_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Promises",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    AmountCents = table.Column<long>(type: "bigint", nullable: false),
                    CoveredCents = table.Column<long>(type: "bigint", nullable: false),
                    DueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ActorId = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Promises", x => x.Id);
                    table.CheckConstraint("CK_Promises_Covered", "[AmountCents] > 0 AND [CoveredCents] >= 0 AND [CoveredCents] <= [AmountCents]");
                    table.ForeignKey(
                        name: "FK_Promises_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Payments",
                columns: table => new
                {
                    Id = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    AccountId = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    ActorId = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ReferenceKey = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    AmountCents = table.Column<long>(type: "bigint", nullable: false),
                    AppliedToPromiseCents = table.Column<long>(type: "bigint", nullable: false),
                    PromiseId = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Payments", x => x.Id);
                    table.CheckConstraint("CK_Payments_Amounts", "[AmountCents] > 0 AND [AppliedToPromiseCents] >= 0 AND [AppliedToPromiseCents] <= [AmountCents]");
                    table.ForeignKey(
                        name: "FK_Payments_Accounts_AccountId",
                        column: x => x.AccountId,
                        principalTable: "Accounts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Payments_Promises_PromiseId",
                        column: x => x.PromiseId,
                        principalTable: "Promises",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_Accounts_AssignedTo",
                table: "Accounts",
                column: "AssignedTo");

            migrationBuilder.CreateIndex(
                name: "IX_Contacts_AccountId_Sequence",
                table: "Contacts",
                columns: new[] { "AccountId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Events_AccountId_Sequence",
                table: "Events",
                columns: new[] { "AccountId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_AccountId_Sequence",
                table: "Payments",
                columns: new[] { "AccountId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_PromiseId",
                table: "Payments",
                column: "PromiseId");

            migrationBuilder.CreateIndex(
                name: "IX_Payments_ReferenceKey",
                table: "Payments",
                column: "ReferenceKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Promises_AccountId_Sequence",
                table: "Promises",
                columns: new[] { "AccountId", "Sequence" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Contacts");

            migrationBuilder.DropTable(
                name: "Events");

            migrationBuilder.DropTable(
                name: "Payments");

            migrationBuilder.DropTable(
                name: "Promises");

            migrationBuilder.DropTable(
                name: "Accounts");
        }
    }
}
