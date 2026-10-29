using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kurul.API.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomAnnouncements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AttendanceIntent",
                table: "Notifications",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "CustomAnnouncementId",
                table: "Notifications",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CustomAnnouncements",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    UnitId = table.Column<int>(type: "int", nullable: false),
                    PublishedById = table.Column<int>(type: "int", nullable: false),
                    Content = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                    MeetingDate = table.Column<DateOnly>(type: "date", nullable: true),
                    MeetingTime = table.Column<string>(type: "nvarchar(5)", maxLength: 5, nullable: true),
                    Location = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    OnlineLink = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    AgendaItemsJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomAnnouncements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CustomAnnouncements_AcademicUnits_UnitId",
                        column: x => x.UnitId,
                        principalTable: "AcademicUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CustomAnnouncements_Users_PublishedById",
                        column: x => x.PublishedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_CustomAnnouncementId",
                table: "Notifications",
                column: "CustomAnnouncementId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_UserId_CustomAnnouncementId",
                table: "Notifications",
                columns: new[] { "UserId", "CustomAnnouncementId" },
                unique: true,
                filter: "[CustomAnnouncementId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_CustomAnnouncements_PublishedById",
                table: "CustomAnnouncements",
                column: "PublishedById");

            migrationBuilder.CreateIndex(
                name: "IX_CustomAnnouncements_UnitId_CreatedAt",
                table: "CustomAnnouncements",
                columns: new[] { "UnitId", "CreatedAt" });

            migrationBuilder.AddForeignKey(
                name: "FK_Notifications_CustomAnnouncements_CustomAnnouncementId",
                table: "Notifications",
                column: "CustomAnnouncementId",
                principalTable: "CustomAnnouncements",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Notifications_CustomAnnouncements_CustomAnnouncementId",
                table: "Notifications");

            migrationBuilder.DropTable(
                name: "CustomAnnouncements");

            migrationBuilder.DropIndex(
                name: "IX_Notifications_CustomAnnouncementId",
                table: "Notifications");

            migrationBuilder.DropIndex(
                name: "IX_Notifications_UserId_CustomAnnouncementId",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "AttendanceIntent",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "CustomAnnouncementId",
                table: "Notifications");
        }
    }
}
