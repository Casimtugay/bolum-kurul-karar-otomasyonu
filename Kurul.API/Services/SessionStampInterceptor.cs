using Kurul.API.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace Kurul.API.Services;

public sealed class SessionStampInterceptor : SaveChangesInterceptor
{
    private static void RefreshStamps(DbContext? context)
    {
        if (context == null) return;
        context.ChangeTracker.DetectChanges();
        foreach (var entry in context.ChangeTracker.Entries<AppUser>())
        {
            if (entry.State == EntityState.Added)
            {
                if (entry.Entity.SessionStamp == Guid.Empty)
                    entry.Entity.SessionStamp = Guid.NewGuid();
                continue;
            }
            if (entry.State != EntityState.Modified) continue;
            var changed = new[] { nameof(AppUser.PasswordHash), nameof(AppUser.IsActive),
                nameof(AppUser.Role), nameof(AppUser.MustChangePassword) }
                .Any(name => entry.Property(name).IsModified &&
                    !Equals(entry.Property(name).OriginalValue, entry.Property(name).CurrentValue));
            if (!changed) continue;
            entry.Entity.SessionStamp = Guid.NewGuid();
            entry.Property(x => x.SessionStamp).IsModified = true;
        }
    }
    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData,
        InterceptionResult<int> result)
    {
        RefreshStamps(eventData.Context);
        return result;
    }
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        RefreshStamps(eventData.Context);
        return ValueTask.FromResult(result);
    }
}
