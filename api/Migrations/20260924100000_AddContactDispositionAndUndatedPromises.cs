using CarteraClara.Api;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace CarteraClara.Api.Migrations;

[DbContext(typeof(CarteraDb))]
[Migration("20260924100000_AddContactDispositionAndUndatedPromises")]
public sealed class AddContactDispositionAndUndatedPromises : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "Disposition",
            table: "Contacts",
            type: "nvarchar(24)",
            maxLength: 24,
            nullable: true);

        migrationBuilder.AlterColumn<DateOnly>(
            name: "DueDate",
            table: "Promises",
            type: "date",
            nullable: true,
            oldClrType: typeof(DateOnly),
            oldType: "date");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("IF EXISTS (SELECT 1 FROM [Promises] WHERE [DueDate] IS NULL) THROW 50000, 'No se puede revertir: hay promesas sin fecha que deben conservarse.', 1;");
        migrationBuilder.AlterColumn<DateOnly>(
            name: "DueDate",
            table: "Promises",
            type: "date",
            nullable: false,
            oldClrType: typeof(DateOnly),
            oldType: "date",
            oldNullable: true);
        migrationBuilder.DropColumn(name: "Disposition", table: "Contacts");
    }
}
