using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

namespace FluxPost.Local
{
    // Windows-only local launcher. A hidden window does not escape an editor's
    // kill-on-close Job; create suspended and prove independence before running.
    public static class IndependentProcess
    {
        [StructLayout(LayoutKind.Sequential)]
        struct SecurityAttributes { public int Size; public IntPtr Descriptor; public int Inherit; }
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct StartupInfo
        {
            public int Size;
            public string Reserved, Desktop, Title;
            public uint X, Y, Width, Height, XChars, YChars, Fill, Flags;
            public short ShowWindow, ReservedBytes;
            public IntPtr ReservedData, Input, Output, Error;
        }
        [StructLayout(LayoutKind.Sequential)]
        struct StartupInfoEx { public StartupInfo Startup; public IntPtr Attributes; }
        [StructLayout(LayoutKind.Sequential)]
        struct ProcessInformation { public IntPtr Process, Thread; public uint Id, ThreadId; }

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool inside);
        [DllImport("kernel32.dll")]
        static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern IntPtr CreateFile(string name, uint access, uint share, ref SecurityAttributes security,
            uint creation, uint attributes, IntPtr template);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute,
            IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
        [DllImport("kernel32.dll")]
        static extern void DeleteProcThreadAttributeList(IntPtr list);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool CreateProcess(string executable, StringBuilder command, IntPtr processSecurity,
            IntPtr threadSecurity, bool inherit, uint flags, IntPtr environment, string cwd,
            ref StartupInfoEx startup, out ProcessInformation process);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern uint ResumeThread(IntPtr thread);
        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool TerminateProcess(IntPtr process, uint code);
        [DllImport("kernel32.dll")]
        static extern bool CloseHandle(IntPtr handle);

        static Exception Failure(string operation)
        {
            return new Win32Exception(Marshal.GetLastWin32Error(), operation);
        }

        // Windows argv quoting, including empty strings, embedded quotes and
        // trailing backslashes. No shell interpretation or command interpolation.
        static string Quote(string value)
        {
            if (value == null || value.IndexOf('\0') >= 0) throw new ArgumentException("Invalid process argument");
            var output = new StringBuilder("\"");
            int slashes = 0;
            foreach (char ch in value)
            {
                if (ch == '\\') { slashes++; continue; }
                if (ch == '"') output.Append('\\', slashes * 2 + 1);
                else output.Append('\\', slashes);
                output.Append(ch);
                slashes = 0;
            }
            return output.Append('\\', slashes * 2).Append('"').ToString();
        }

        public static Process Start(string executable, string[] arguments, string cwd, string errorPath)
        {
            bool inJob;
            if (!IsProcessInJob(GetCurrentProcess(), IntPtr.Zero, out inJob)) throw Failure("Inspect launcher Job");
            var command = new StringBuilder(Quote(executable));
            foreach (string argument in arguments) command.Append(' ').Append(Quote(argument));
            var security = new SecurityAttributes { Size = Marshal.SizeOf(typeof(SecurityAttributes)), Inherit = 1 };
            IntPtr invalid = new IntPtr(-1), nullHandle = invalid, errorHandle = invalid;
            IntPtr attributeList = IntPtr.Zero, handles = IntPtr.Zero;
            bool attributesReady = false, resumed = false;
            var nativeProcess = new ProcessInformation();
            Process process = null;
            try
            {
                nullHandle = CreateFile("NUL", 0xC0000000, 3, ref security, 3, 0x80, IntPtr.Zero);
                if (nullHandle == invalid) throw Failure("Open independent process null streams");
                errorHandle = CreateFile(errorPath, 0x40000000, 3, ref security, 2, 0x80, IntPtr.Zero);
                if (errorHandle == invalid) throw Failure("Open supervisor stderr log");
                IntPtr size = IntPtr.Zero;
                InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref size);
                if (size == IntPtr.Zero) throw Failure("Size process handle list");
                attributeList = Marshal.AllocHGlobal(size);
                if (!InitializeProcThreadAttributeList(attributeList, 1, 0, ref size)) throw Failure("Initialize process handle list");
                attributesReady = true;
                handles = Marshal.AllocHGlobal(IntPtr.Size * 2);
                Marshal.WriteIntPtr(handles, 0, nullHandle);
                Marshal.WriteIntPtr(handles, IntPtr.Size, errorHandle);
                // PROC_THREAD_ATTRIBUTE_HANDLE_LIST: never inherit editor pipes or Job handles.
                if (!UpdateProcThreadAttribute(attributeList, 0, new IntPtr(0x20002), handles,
                    new IntPtr(IntPtr.Size * 2), IntPtr.Zero, IntPtr.Zero)) throw Failure("Restrict inherited handles");
                var startup = new StartupInfoEx();
                startup.Startup.Size = Marshal.SizeOf(typeof(StartupInfoEx));
                startup.Startup.Flags = 0x100; // STARTF_USESTDHANDLES
                startup.Startup.Input = startup.Startup.Output = nullHandle;
                startup.Startup.Error = errorHandle;
                startup.Attributes = attributeList;
                // CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT | CREATE_SUSPENDED
                uint flags = 0x08080004;
                if (inJob) flags |= 0x01000000; // CREATE_BREAKAWAY_FROM_JOB
                if (!CreateProcess(executable, command, IntPtr.Zero, IntPtr.Zero, true, flags,
                    IntPtr.Zero, cwd, ref startup, out nativeProcess))
                    throw Failure("Cannot start independent local process (Job breakaway must be allowed)");
                bool childInJob;
                if (!IsProcessInJob(nativeProcess.Process, IntPtr.Zero, out childInJob)) throw Failure("Inspect child Job");
                if (childInJob) throw new InvalidOperationException("Local process still belongs to a Job; refusing dependent startup");
                process = Process.GetProcessById((int)nativeProcess.Id);
                // Hold a Process handle before resume, including for short-lived preflight probes.
                IntPtr retainedHandle = process.Handle;
                if (ResumeThread(nativeProcess.Thread) == UInt32.MaxValue) throw Failure("Resume independent process");
                resumed = true;
                return process;
            }
            finally
            {
                if (!resumed && nativeProcess.Process != IntPtr.Zero) TerminateProcess(nativeProcess.Process, 1);
                if (!resumed && process != null) process.Dispose();
                if (nativeProcess.Thread != IntPtr.Zero) CloseHandle(nativeProcess.Thread);
                if (nativeProcess.Process != IntPtr.Zero) CloseHandle(nativeProcess.Process);
                if (attributesReady) DeleteProcThreadAttributeList(attributeList);
                if (attributeList != IntPtr.Zero) Marshal.FreeHGlobal(attributeList);
                if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles);
                if (errorHandle != invalid) CloseHandle(errorHandle);
                if (nullHandle != invalid) CloseHandle(nullHandle);
            }
        }
    }
}
