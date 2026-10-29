using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kurul.API.Migrations
{
    /// <inheritdoc />
    public partial class LogQueryIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_AcademicUnitId_CreatedAt",
                table: "AuditLogs",
                columns: new[] { "AcademicUnitId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogs_AcademicUnitId_Id",
                table: "AuditLogs",
                columns: new[] { "AcademicUnitId", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AuditLogs_AcademicUnitId_CreatedAt",
                table: "AuditLogs");

            migrationBuilder.DropIndex(
                name: "IX_AuditLogs_AcademicUnitId_Id",
                table: "AuditLogs");
        }
    }
}
