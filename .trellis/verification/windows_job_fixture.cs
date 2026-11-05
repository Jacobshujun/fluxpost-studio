using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

// Test-only owned Job. Closing it must kill the launcher, never the real app.
public sealed class WindowsJobFixture : IDisposable
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct Startup
    {
        public int Size; public string Reserved, Desktop, Title;
        public uint X, Y, Width, Height, XChars, YChars, Fill, Flags;
        public short Show, ReservedBytes;
        public IntPtr Data, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct Info { public IntPtr Process, Thread; public uint Id, ThreadId; }
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr CreateJobObject(IntPtr security, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetInformationJobObject(IntPtr job, int cls, IntPtr value, uint size);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CreateProcess(string executable, StringBuilder command, IntPtr pa, IntPtr ta,
        bool inherit, uint flags, IntPtr env, string cwd, ref Startup startup, out Info info);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll")]
    static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);
    IntPtr job;
    public WindowsJobFixture(bool allowBreakaway)
    {
        job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new Win32Exception();
        // JOBOBJECT_EXTENDED_LIMIT_INFORMATION: BasicLimitInformation.LimitFlags at 16.
        int size = IntPtr.Size == 8 ? 144 : 112;
        IntPtr limits = Marshal.AllocHGlobal(size);
        try
        {
            for (int i = 0; i < size; i++) Marshal.WriteByte(limits, i, 0);
            Marshal.WriteInt32(limits, 16, allowBreakaway ? 0x2800 : 0x2000);
            if (!SetInformationJobObject(job, 9, limits, (uint)size)) throw new Win32Exception();
        }
        catch { Dispose(); throw; }
        finally { Marshal.FreeHGlobal(limits); }
    }
    public uint Start(string executable, string encodedCommand, string cwd)
    {
        var startup = new Startup { Size = Marshal.SizeOf(typeof(Startup)) };
        Info info;
        var command = new StringBuilder("\"" + executable + "\" -NoProfile -NonInteractive -EncodedCommand " + encodedCommand);
        if (!CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, false, 0x08000004,
            IntPtr.Zero, cwd, ref startup, out info)) throw new Win32Exception();
        bool resumed = false;
        try
        {
            if (!AssignProcessToJobObject(job, info.Process)) throw new Win32Exception();
            if (ResumeThread(info.Thread) == UInt32.MaxValue) throw new Win32Exception();
            resumed = true;
            return info.Id;
        }
        finally
        {
            if (!resumed) TerminateProcess(info.Process, 1);
            CloseHandle(info.Thread); CloseHandle(info.Process);
        }
    }
    public void Dispose() { if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; } }
}
