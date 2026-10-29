using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kurul.API.Migrations
{
    /// <inheritdoc />
    public partial class DecisionLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CancellationReason",
                table: "Decisions",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "CancelledAt",
                table: "Decisions",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CancelledById",
                table: "Decisions",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CancelledByName",
                table: "Decisions",
                type: "nvarchar(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ReconsiderationDecisionId",
                table: "Decisions",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SourceDecisionId",
                table: "Decisions",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CancellationReason",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "CancelledAt",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "CancelledById",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "CancelledByName",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "ReconsiderationDecisionId",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "SourceDecisionId",
                table: "Decisions");
        }
    }
}
