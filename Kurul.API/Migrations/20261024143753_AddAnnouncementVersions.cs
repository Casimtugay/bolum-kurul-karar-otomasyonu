using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kurul.API.Migrations
{
    /// <inheritdoc />
    public partial class AddAnnouncementVersions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Notifications_UserId",
                table: "Notifications");

            migrationBuilder.AddColumn<int>(
                name: "PublicationId",
                table: "Notifications",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "MeetingAgendaPublications",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    MeetingId = table.Column<int>(type: "int", nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    ContentHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    ItemsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    PublishedById = table.Column<int>(type: "int", nullable: false),
                    PublishedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MeetingAgendaPublications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MeetingAgendaPublications_Meetings_MeetingId",
                        column: x => x.MeetingId,
                        principalTable: "Meetings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_MeetingAgendaPublications_Users_PublishedById",
                        column: x => x.PublishedById,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_PublicationId",
                table: "Notifications",
                column: "PublicationId");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_UserId_PublicationId",
                table: "Notifications",
                columns: new[] { "UserId", "PublicationId" },
                unique: true,
                filter: "[PublicationId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_UserId_UnitId_IsRead",
                table: "Notifications",
                columns: new[] { "UserId", "UnitId", "IsRead" });

            migrationBuilder.CreateIndex(
                name: "IX_MeetingAgendaPublications_MeetingId_Version",
                table: "MeetingAgendaPublications",
                columns: new[] { "MeetingId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MeetingAgendaPublications_PublishedById",
                table: "MeetingAgendaPublications",
                column: "PublishedById");

            migrationBuilder.AddForeignKey(
                name: "FK_Notifications_MeetingAgendaPublications_PublicationId",
                table: "Notifications",
                column: "PublicationId",
                principalTable: "MeetingAgendaPublications",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.Sql(@"
                INSERT INTO [MeetingAgendaPublications] ([MeetingId], [Version], [ContentHash], [ItemsJson], [PublishedById], [PublishedAt]) SELECT m.[Id], 1, '', ISNULL((SELECT a.[Title] AS [title], ISNULL(a.[Description], '') AS [description] FROM [MeetingAgendas] a WHERE a.[MeetingId] = m.[Id] ORDER BY a.[OrderNo] FOR JSON PATH), '[]'), m.[CreatedById], ISNULL(m.[PublishedAt], SYSUTCDATETIME()) FROM [Meetings] m WHERE m.[IsPublished] = 1;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Notifications_MeetingAgendaPublications_PublicationId",
                table: "Notifications");

            migrationBuilder.DropTable(
                name: "MeetingAgendaPublications");

            migrationBuilder.DropIndex(
                name: "IX_Notifications_PublicationId",
                table: "Notifications");

            migrationBuilder.DropIndex(
                name: "IX_Notifications_UserId_PublicationId",
                table: "Notifications");

            migrationBuilder.DropIndex(
                name: "IX_Notifications_UserId_UnitId_IsRead",
                table: "Notifications");

            migrationBuilder.DropColumn(
                name: "PublicationId",
                table: "Notifications");

            migrationBuilder.CreateIndex(
                name: "IX_Notifications_UserId",
                table: "Notifications",
                column: "UserId");
        }
    }
}
