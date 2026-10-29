using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kurul.API.Migrations
{
    /// <inheritdoc />
    public partial class ContentBoundDemoSignatures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SignatureVersion",
                table: "Decisions",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SigningContentFrozenAt",
                table: "Decisions",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SigningContentHash",
                table: "Decisions",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SignatureChallengeExpiresAt",
                table: "DecisionParticipants",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SignatureChallengeId",
                table: "DecisionParticipants",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SignatureData",
                table: "DecisionParticipants",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SignedContentHash",
                table: "DecisionParticipants",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SignatureVersion",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "SigningContentFrozenAt",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "SigningContentHash",
                table: "Decisions");

            migrationBuilder.DropColumn(
                name: "SignatureChallengeExpiresAt",
                table: "DecisionParticipants");

            migrationBuilder.DropColumn(
                name: "SignatureChallengeId",
                table: "DecisionParticipants");

            migrationBuilder.DropColumn(
                name: "SignatureData",
                table: "DecisionParticipants");

            migrationBuilder.DropColumn(
                name: "SignedContentHash",
                table: "DecisionParticipants");
        }
    }
}
