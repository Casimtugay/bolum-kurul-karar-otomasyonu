using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kurul.API.Migrations;

public partial class UnitPresentation : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "TitleLine1",
            table: "AcademicUnits",
            type: "nvarchar(200)",
            maxLength: 200,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<string>(
            name: "TitleLine2",
            table: "AcademicUnits",
            type: "nvarchar(200)",
            maxLength: 200,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<string>(
            name: "MembersLabel",
            table: "AcademicUnits",
            type: "nvarchar(200)",
            maxLength: 200,
            nullable: false,
            defaultValue: "");

        migrationBuilder.AddColumn<string>(
            name: "LogoPath",
            table: "AcademicUnits",
            type: "nvarchar(300)",
            maxLength: 300,
            nullable: false,
            defaultValue: "");

        migrationBuilder.Sql("""
            UPDATE [AcademicUnits]
            SET
                [TitleLine1] = N'BİLGİSAYAR MÜHENDİSLİĞİ',
                [TitleLine2] = N'BÖLÜM KURUL KARARI',
                [MembersLabel] = N'Bölüm Kurulu Üyeleri',
                [LogoPath] = N'/su_bilgisayar.png'
            WHERE [Code] = N'bilgisayar-bolum';

            UPDATE [AcademicUnits]
            SET
                [TitleLine1] = N'BİLGİSAYAR MÜHENDİSLİĞİ',
                [TitleLine2] = N'ANABİLİM DALI KURUL KARARI',
                [MembersLabel] = N'Anabilim Dalı Kurul Üyeleri',
                [LogoPath] = N'/su_fbe.png'
            WHERE [Code] = N'bilgisayar-abd';

            UPDATE [AcademicUnits]
            SET
                [TitleLine1] = N'BİLİŞİM TEKNOLOJİLERİ MÜHENDİSLİĞİ',
                [TitleLine2] = N'ANABİLİM DALI KURUL KARARI',
                [MembersLabel] = N'Anabilim Dalı Kurul Üyeleri',
                [LogoPath] = N'/su_fbe.png'
            WHERE [Code] = N'bilisim-abd';
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "TitleLine1",
            table: "AcademicUnits");

        migrationBuilder.DropColumn(
            name: "TitleLine2",
            table: "AcademicUnits");

        migrationBuilder.DropColumn(
            name: "MembersLabel",
            table: "AcademicUnits");

        migrationBuilder.DropColumn(
            name: "LogoPath",
            table: "AcademicUnits");
    }
}