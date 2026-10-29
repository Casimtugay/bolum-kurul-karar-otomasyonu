using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kurul.API.Migrations
{
    /// <inheritdoc />
    public partial class BindSigningPdf : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte[]>(
                name: "SigningPdfBytes",
                table: "Decisions",
                type: "varbinary(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SigningPdfFrozenAt",
                table: "Decisions",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SigningPdfHash",
                table: "Decisions",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SigningPdfBytes",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "SigningPdfFrozenAt",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "SigningPdfHash",
                table: "Decisions");
        }
    }
}
