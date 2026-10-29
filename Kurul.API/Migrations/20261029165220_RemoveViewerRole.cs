using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Kurul.API.Migrations
{
    /// <summary>
    /// Hazır "Görüntüleyici" rolü projeden kaldırılır (yerel ve canlı veritabanı).
    /// Bu role bağlı üyelikler aynı kurulun hazır Üye rolüne taşınır; oy hakları
    /// (IsBoardMember) değiştirilmez. Özel rollerin "Goruntuleyici" türü "OyKullanmayan" olur.
    /// Ayrıca yer tutucu @kurul.test adresleri @selcuk.edu.tr olarak güncellenir.
    /// </summary>
    public partial class RemoveViewerRole : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE uu
                SET uu.RoleId = member.Id,
                    uu.UnitRole = member.Kind,
                    uu.Duty = CASE WHEN uu.Duty = viewer.Name THEN member.Name ELSE uu.Duty END
                FROM UserUnits uu
                INNER JOIN Roles viewer ON viewer.Id = uu.RoleId
                INNER JOIN Roles member
                    ON member.AcademicUnitId = viewer.AcademicUnitId
                   AND member.IsSystem = 1
                   AND member.Kind = 'Uye'
                WHERE viewer.IsSystem = 1 AND viewer.Kind = 'Goruntuleyici';

                DELETE FROM Roles WHERE IsSystem = 1 AND Kind = 'Goruntuleyici'
                    AND NOT EXISTS (SELECT 1 FROM UserUnits uu WHERE uu.RoleId = Roles.Id);

                UPDATE Roles SET Kind = 'OyKullanmayan' WHERE Kind = 'Goruntuleyici';
                UPDATE UserUnits SET UnitRole = 'OyKullanmayan' WHERE UnitRole = 'Goruntuleyici';

                UPDATE Users
                SET Email = LEFT(Email, LEN(Email) - LEN('@kurul.test')) + '@selcuk.edu.tr'
                WHERE Email LIKE '%@kurul.test'
                  AND NOT EXISTS (
                      SELECT 1 FROM Users other
                      WHERE other.Email = LEFT(Users.Email, LEN(Users.Email) - LEN('@kurul.test')) + '@selcuk.edu.tr');
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Veri dönüşümü geri alınmaz.
        }
    }
}
