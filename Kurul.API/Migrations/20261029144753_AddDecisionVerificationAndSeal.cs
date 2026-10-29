using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kurul.API.Migrations
{
    /// <inheritdoc />
    public partial class AddDecisionVerificationAndSeal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte[]>(
                name: "FinalPdfBytes",
                table: "Decisions",
                type: "varbinary(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FinalPdfHash",
                table: "Decisions",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "FinalPdfSealedAt",
                table: "Decisions",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "VerificationCode",
                table: "Decisions",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Decisions_VerificationCode",
                table: "Decisions",
                column: "VerificationCode",
                unique: true,
                filter: "[VerificationCode] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Decisions_VerificationCode",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "FinalPdfBytes",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "FinalPdfHash",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "FinalPdfSealedAt",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "VerificationCode",
                table: "Decisions");
        }
    }
}
