using CarteraClara.Api;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace CarteraClara.Api.Migrations;

[DbContext(typeof(CarteraDb))]
[Migration("20260923223000_AddPromiseFollowUpDate")]
public sealed class AddPromiseFollowUpDate : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<DateOnly>(
            name: "NextFollowUpDate",
            table: "Promises",
            type: "date",
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "NextFollowUpDate", table: "Promises");
    }
}
