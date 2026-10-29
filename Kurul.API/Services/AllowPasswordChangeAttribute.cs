namespace Kurul.API.Services;

// Yalnızca parola durumu ve parola değiştirme uç noktalarında kullanılır.
[AttributeUsage(AttributeTargets.Method)]
public sealed class AllowPasswordChangeAttribute : Attribute { }
