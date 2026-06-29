var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as process from "process";
import * as cache from "@actions/cache";
import * as core from "@actions/core";
import { exec, getExecOutput } from "@actions/exec";
import * as glob from "glob";
import { compare } from "compare-versions";
import "source-map-support/register.js";
console.log("hello, world!");
const compareVersions = (v1, op, v2) => {
    return compare(v1, v2, op);
};
const setOrAppendEnvVar = (name, value) => {
    const oldValue = process.env[name];
    let newValue = value;
    if (oldValue) {
        newValue = `${oldValue}:${newValue}`;
    }
    core.exportVariable(name, newValue);
};
const dirExists = (dir) => {
    try {
        return fs.statSync(dir).isDirectory();
    }
    catch (_a) {
        return false;
    }
};
// Names of directories for tools (tools_conan & tools_ninja) that include binaries in the
// base directory instead of a bin directory (ie 'Tools/Conan', not 'Tools/Conan/bin')
const binlessToolDirectories = ["Conan", "Ninja"];
const toolsPaths = (installDir) => {
    const binlessPaths = binlessToolDirectories
        .map((dir) => path.join(installDir, "Tools", dir))
        .filter((dir) => dirExists(dir));
    return [
        "Tools/**/bin",
        "*.app/Contents/MacOS",
        "*.app/**/bin",
        "Tools/*/*.app/Contents/MacOS",
        "Tools/*/*.app/**/bin",
    ]
        .flatMap((p) => glob.sync(`${installDir}/${p}`))
        .concat(binlessPaths)
        .map((p) => path.resolve(p));
};
const pythonCommand = (command, args) => {
    const python = process.platform === "win32" ? "python" : "python3";
    return `${python} -m ${command} ${args.join(" ")}`;
};
const execPython = (command, args) => __awaiter(void 0, void 0, void 0, function* () {
    return exec(pythonCommand(command, args));
});
const getPythonOutput = (command, args) => __awaiter(void 0, void 0, void 0, function* () {
    // Aqtinstall prints to both stderr and stdout, depending on the command.
    // This function assumes we don't care which is which, and we want to see it all.
    const out = yield getExecOutput(pythonCommand(command, args));
    return out.stdout + out.stderr;
});
const flaggedList = (flag, listArgs) => {
    return listArgs.length ? [flag, ...listArgs] : [];
};
const locateQtArchDir = (installDir, host) => {
    // For 6.4.2/gcc, qmake is at 'installDir/6.4.2/gcc_64/bin/qmake'.
    // This makes a list of all the viable arch directories that contain a qmake file.
    const qtArchDirs = glob
        .sync(`${installDir}/[0-9]*/*/bin/qmake*`)
        .map((s) => path.resolve(s, "..", ".."));
    // For Qt6 mobile and wasm installations, and Qt6 Windows on ARM cross-compiled installations,
    // a standard desktop Qt installation must exist alongside the requested architecture.
    // In these cases, we must select the first item that ends with 'android*', 'ios', 'wasm*' or 'msvc*_arm64'.
    const requiresParallelDesktop = qtArchDirs.filter((archPath) => {
        var _a;
        const archDir = path.basename(archPath);
        const versionDir = path.basename(path.join(archPath, ".."));
        return (versionDir.match(/^6\.\d+\.\d+$/) &&
            ((_a = archDir.match(/^(android.*|ios|wasm.*)$/) /* Was "||", @typescript-eslint/prefer-nullish-coalescing */) !== null && _a !== void 0 ? _a : (archDir.match(/^msvc.*_arm64$/) && host !== "windows_arm64")));
    });
    if (requiresParallelDesktop.length) {
        // NOTE: if multiple mobile/wasm installations coexist, this may not select the desired directory
        return [requiresParallelDesktop[0], true];
    }
    else if (!qtArchDirs.length) {
        throw Error(`Failed to locate a Qt installation directory in  ${installDir}`);
    }
    else {
        // NOTE: if multiple Qt installations exist, this may not select the desired directory
        return [qtArchDirs[0], false];
    }
};
const isAutodesktopSupported = () => __awaiter(void 0, void 0, void 0, function* () {
    const rawOutput = yield getPythonOutput("aqt", ["version"]);
    const match = rawOutput.match(/aqtinstall\(aqt\)\s+v(\d+\.\d+\.\d+)/);
    return match ? compareVersions(match[1], ">=", "3.0.0") : false;
});
const resolveInputs = () => __awaiter(void 0, void 0, void 0, function* () {
    const parseBoolInput = (input) => {
        return input.toLowerCase() === "true";
    };
    const parseStringArrayInput = (input) => {
        return input ? input.split(" ") : [];
    };
    const fetchRequestedQtVersion = (host, target, version) => __awaiter(void 0, void 0, void 0, function* () {
        core.info(`Resolving Qt version ${version}...`);
        const rawOutput = yield getPythonOutput("aqt", [
            "list-qt",
            host,
            target,
            "--spec",
            version,
            "--latest-version",
        ]);
        const match = rawOutput.trim().match(/^\d+\.\d+\.\d+$/);
        if (!match) {
            throw Error(`No available Qt version found by specified inputs. Output:\n${rawOutput}`);
        }
        return match[0];
    });
    // The order of properties should match the "inputs" definition in
    // "action/action.yml" for readability.
    const rawInputs = {
        dir: core.getInput("dir"),
        version: core.getInput("version"),
        host: core.getInput("host"),
        target: core.getInput("target"),
        arch: core.getInput("arch"),
        installDeps: core.getInput("install-deps"),
        modules: core.getInput("modules"),
        archives: core.getInput("archives"),
        cache: core.getInput("cache"),
        cacheKeyPrefix: core.getInput("cache-key-prefix"),
        tools: core.getInput("tools"),
        addToolsToPath: core.getInput("add-tools-to-path"),
        setEnv: core.getInput("set-env"),
        noQtBinaries: core.getInput("no-qt-binaries"),
        toolsOnly: core.getInput("tools-only"),
        aqtSource: core.getInput("aqtsource"),
        aqtVersion: core.getInput("aqtversion"),
        py7zrVersion: core.getInput("py7zrversion"),
        extra: core.getInput("extra"),
        source: core.getInput("source"),
        srcArchives: core.getInput("src-archives"),
        documentation: core.getInput("documentation"),
        docArchives: core.getInput("doc-archives"),
        docModules: core.getInput("doc-modules"),
        examples: core.getInput("examples"),
        exampleArchives: core.getInput("example-archives"),
        exampleModules: core.getInput("example-modules"),
        useOfficial: core.getInput("use-official"),
        email: core.getInput("email"),
        pw: core.getInput("pw"),
    };
    // The "version" property will be populated per remote data fetched by aqt,
    // so installing aqt and related packages is required here.
    {
        // Install dependencies via pip
        yield execPython("pip install", ["setuptools>=70.1.0", `"py7zr${rawInputs.py7zrVersion}"`]);
        // Install aqtinstall separately: allows aqtinstall to override py7zr if required
        if (rawInputs.aqtSource.length > 0) {
            yield execPython("pip install", [`"${rawInputs.aqtSource}"`]);
        }
        else {
            yield execPython("pip install", [`"aqtinstall${rawInputs.aqtVersion}"`]);
        }
    }
    const host = (() => {
        // Set host automatically if omitted
        if (!rawInputs.host) {
            switch (process.platform) {
                case "win32": {
                    return process.arch === "arm64" ? "windows_arm64" : "windows";
                }
                case "darwin": {
                    return "mac";
                }
                default: {
                    return process.arch === "arm64" ? "linux_arm64" : "linux";
                }
            }
        }
        else {
            // Make sure host is one of the allowed values
            if (rawInputs.host === "windows" ||
                rawInputs.host === "windows_arm64" ||
                rawInputs.host === "mac" ||
                rawInputs.host === "linux" ||
                rawInputs.host === "linux_arm64" ||
                rawInputs.host === "all_os") {
                return rawInputs.host;
            }
            else {
                throw TypeError(`host: "${rawInputs.host}" is not one of "windows" | "windows_arm64" | "mac" | "linux" | "linux_arm64" | "all_os"`);
            }
        }
    })();
    const target = (() => {
        // Make sure target is one of the allowed values
        if (rawInputs.target === "desktop" ||
            rawInputs.target === "android" ||
            rawInputs.target === "ios" ||
            rawInputs.target === "wasm") {
            return rawInputs.target;
        }
        else {
            throw TypeError(`target: "${rawInputs.target}" is not one of "desktop" | "android" | "ios" | "wasm"`);
        }
    })();
    // The aqtinstall supports SimpleSpec (semver). To make all "compareVersions()" happy,
    // we have to fetch the requested Qt version here and always use that version in all
    // subsequent work, for example, generating cache key.
    const version = yield fetchRequestedQtVersion(host, target, rawInputs.version);
    const arch = (() => {
        // Set arch automatically if omitted
        if (!rawInputs.arch) {
            if (target === "android") {
                if (compareVersions(version, ">=", "5.14.0") && compareVersions(version, "<", "6.0.0")) {
                    return "android";
                }
                else {
                    return "android_armv7";
                }
            }
            else if (host === "windows") {
                if (compareVersions(version, ">=", "6.8.0")) {
                    return "win64_msvc2022_64";
                }
                else if (compareVersions(version, ">=", "5.15.0")) {
                    return "win64_msvc2019_64";
                }
                else if (compareVersions(version, "<", "5.6.0")) {
                    return "win64_msvc2013_64";
                }
                else if (compareVersions(version, "<", "5.9.0")) {
                    return "win64_msvc2015_64";
                }
                else {
                    return "win64_msvc2017_64";
                }
            }
            else if (host === "windows_arm64") {
                return "win64_msvc2022_arm64";
            }
        }
        return rawInputs.arch;
    })();
    const inputs = {
        host: host,
        target: target,
        version: version,
        arch: arch,
        dir: (() => {
            const dir = rawInputs.dir || process.env.RUNNER_WORKSPACE;
            if (!dir) {
                throw TypeError(`"dir" input may not be empty`);
            }
            return path.resolve(dir, "Qt");
        })(),
        modules: parseStringArrayInput(rawInputs.modules),
        archives: parseStringArrayInput(rawInputs.archives),
        tools: parseStringArrayInput(rawInputs.tools).map(
        // The tools inputs have the tool name, variant, and arch delimited by a comma
        // aqt expects spaces instead
        (tool) => tool.replace(/,/g, " ")),
        addToolsToPath: parseBoolInput(rawInputs.addToolsToPath),
        extra: parseStringArrayInput(rawInputs.extra),
        installDeps: (() => {
            if (rawInputs.installDeps.toLowerCase() === "nosudo") {
                return "nosudo";
            }
            else {
                return parseBoolInput(rawInputs.installDeps);
            }
        })(),
        cache: parseBoolInput(rawInputs.cache),
        cacheKeyPrefix: rawInputs.cacheKeyPrefix,
        isInstallQtBinaries: !parseBoolInput(rawInputs.toolsOnly) && !parseBoolInput(rawInputs.noQtBinaries),
        setEnv: parseBoolInput(rawInputs.setEnv),
        aqtSource: rawInputs.aqtSource,
        aqtVersion: rawInputs.aqtVersion,
        py7zrVersion: rawInputs.py7zrVersion,
        useOfficial: parseBoolInput(rawInputs.useOfficial),
        email: rawInputs.email,
        pw: rawInputs.pw,
        src: parseBoolInput(rawInputs.source),
        srcArchives: parseStringArrayInput(rawInputs.srcArchives),
        doc: parseBoolInput(rawInputs.documentation),
        docModules: parseStringArrayInput(rawInputs.docModules),
        docArchives: parseStringArrayInput(rawInputs.docArchives),
        example: parseBoolInput(rawInputs.examples),
        exampleModules: parseStringArrayInput(rawInputs.exampleModules),
        exampleArchives: parseStringArrayInput(rawInputs.exampleArchives),
    };
    // Then, generate the cache key with the exact available Qt version.
    const cacheKey = (() => {
        let _cacheKey = inputs.cacheKeyPrefix;
        for (const keyStringArray of [
            [
                inputs.host,
                os.release(),
                inputs.target,
                inputs.arch,
                inputs.version,
                inputs.dir,
                inputs.py7zrVersion,
                inputs.aqtSource,
                inputs.aqtVersion,
                inputs.useOfficial ? "official" : "",
            ],
            inputs.modules,
            inputs.archives,
            inputs.extra,
            inputs.tools,
            inputs.src ? "src" : "",
            inputs.srcArchives,
            inputs.doc ? "doc" : "",
            inputs.docArchives,
            inputs.docModules,
            inputs.example ? "example" : "",
            inputs.exampleArchives,
            inputs.exampleModules,
        ]) {
            for (const keyString of keyStringArray) {
                if (keyString) {
                    _cacheKey += `-${keyString}`;
                }
            }
        }
        // Cache keys cannot contain commas
        _cacheKey = _cacheKey.replace(/,/g, "-");
        // Cache keys cannot be larger than 512 characters
        const maxKeyLength = 512;
        if (_cacheKey.length > maxKeyLength) {
            const hashedCacheKey = crypto.createHash("sha256").update(_cacheKey).digest("hex");
            _cacheKey = `${inputs.cacheKeyPrefix}-${hashedCacheKey}`;
        }
        return _cacheKey;
    })();
    return { inputs, cacheKey };
});
const run = () => __awaiter(void 0, void 0, void 0, function* () {
    const { inputs, cacheKey } = yield resolveInputs();
    // Qt installer assumes basic requirements that are not installed by
    // default on Ubuntu.
    if (process.platform === "linux") {
        if (inputs.installDeps) {
            const dependencies = [
                "build-essential",
                "libgl1-mesa-dev",
                "libgstreamer-gl1.0-0",
                "libpulse-dev",
                "libxcb-glx0",
                "libxcb-icccm4",
                "libxcb-image0",
                "libxcb-keysyms1",
                "libxcb-randr0",
                "libxcb-render-util0",
                "libxcb-render0",
                "libxcb-shape0",
                "libxcb-shm0",
                "libxcb-sync1",
                "libxcb-util1",
                "libxcb-xfixes0",
                "libxcb-xinerama0",
                "libxcb1",
                "libxkbcommon-dev",
                "libxkbcommon-x11-0",
                "libxcb-xkb-dev",
            ];
            // Qt 6.5.0 adds this requirement:
            // https://code.qt.io/cgit/qt/qtreleasenotes.git/about/qt/6.5.0/release-note.md
            if (compareVersions(inputs.version, ">=", "6.5.0")) {
                dependencies.push("libxcb-cursor0");
            }
            const updateCommand = "apt-get update";
            const installCommand = `apt-get install ${dependencies.join(" ")} -y`;
            if (inputs.installDeps === "nosudo") {
                yield exec(updateCommand);
                yield exec(installCommand);
            }
            else {
                yield exec(`sudo ${updateCommand}`);
                yield exec(`sudo ${installCommand}`);
            }
        }
    }
    // Restore internal cache
    let internalCacheHit = false;
    if (inputs.cache) {
        const cacheHitKey = yield cache.restoreCache([inputs.dir], cacheKey);
        if (cacheHitKey) {
            core.info(`Automatic cache hit with key "${cacheHitKey}"`);
            internalCacheHit = true;
        }
        else {
            core.info("Automatic cache miss, will cache this run");
        }
    }
    // Install Qt and tools if not cached
    if (!internalCacheHit) {
        // This flag will install a parallel desktop version of Qt, only where required.
        // aqtinstall will automatically determine if this is necessary.
        const autodesktop = (yield isAutodesktopSupported()) ? ["--autodesktop"] : [];
        // Install Qt
        if (inputs.isInstallQtBinaries) {
            if (inputs.useOfficial && inputs.email && inputs.pw) {
                const qtArgs = [
                    "install-qt-official",
                    inputs.target,
                    ...(inputs.arch ? [inputs.arch] : []),
                    inputs.version,
                    ...["--outputdir", inputs.dir],
                    ...["--email", inputs.email],
                    ...["--pw", inputs.pw],
                    ...flaggedList("--modules", inputs.modules),
                    ...inputs.extra,
                ];
                yield execPython("aqt", qtArgs);
            }
            else {
                const qtArgs = [
                    "install-qt",
                    inputs.host,
                    inputs.target,
                    inputs.version,
                    ...(inputs.arch ? [inputs.arch] : []),
                    ...autodesktop,
                    ...["--outputdir", inputs.dir],
                    ...flaggedList("--modules", inputs.modules),
                    ...flaggedList("--archives", inputs.archives),
                    ...inputs.extra,
                ];
                yield execPython("aqt", qtArgs);
            }
        }
        const installSrcDocExamples = (flavor, archives, modules) => __awaiter(void 0, void 0, void 0, function* () {
            const qtArgs = [
                inputs.host,
                // Aqtinstall < 2.0.4 requires `inputs.target` here, but that's deprecated
                inputs.version,
                ...["--outputdir", inputs.dir],
                ...flaggedList("--archives", archives),
                ...flaggedList("--modules", modules),
                ...inputs.extra,
            ];
            yield execPython(`aqt install-${flavor}`, qtArgs);
        });
        // Install source, docs, & examples
        if (inputs.src) {
            yield installSrcDocExamples("src", inputs.srcArchives, []);
        }
        if (inputs.doc) {
            yield installSrcDocExamples("doc", inputs.docArchives, inputs.docModules);
        }
        if (inputs.example) {
            yield installSrcDocExamples("example", inputs.exampleArchives, inputs.exampleModules);
        }
        // Install tools
        for (const tool of inputs.tools) {
            const toolArgs = [inputs.host, inputs.target, tool];
            toolArgs.push("--outputdir", inputs.dir);
            toolArgs.push(...inputs.extra);
            yield execPython("aqt install-tool", toolArgs);
        }
    }
    // Save automatic cache
    if (!internalCacheHit && inputs.cache) {
        const cacheId = yield cache.saveCache([inputs.dir], cacheKey);
        core.info(`Automatic cache saved with key "${cacheKey}", cache id is "${cacheId}"`);
    }
    // Add tools to path
    if (inputs.addToolsToPath && inputs.tools.length) {
        toolsPaths(inputs.dir).forEach(core.addPath);
    }
    // Set environment variables/outputs for tools
    if (inputs.tools.length && inputs.setEnv) {
        core.exportVariable("IQTA_TOOLS", path.resolve(inputs.dir, "Tools"));
    }
    // Set environment variables/outputs for binaries
    if (inputs.isInstallQtBinaries) {
        const [qtPath, requiresParallelDesktop] = locateQtArchDir(inputs.dir, inputs.host);
        // Set outputs
        core.setOutput("qtPath", qtPath);
        // Set env variables
        if (inputs.setEnv) {
            if (process.platform === "linux") {
                setOrAppendEnvVar("LD_LIBRARY_PATH", path.resolve(qtPath, "lib"));
            }
            if (process.platform !== "win32") {
                setOrAppendEnvVar("PKG_CONFIG_PATH", path.resolve(qtPath, "lib", "pkgconfig"));
            }
            // If less than qt6, set Qt5_DIR variable
            if (compareVersions(inputs.version, "<", "6.0.0")) {
                core.exportVariable("Qt5_DIR", path.resolve(qtPath, "lib", "cmake"));
            }
            core.exportVariable("QT_ROOT_DIR", qtPath);
            core.exportVariable("QT_PLUGIN_PATH", path.resolve(qtPath, "plugins"));
            core.exportVariable("QML2_IMPORT_PATH", path.resolve(qtPath, "qml"));
            if (requiresParallelDesktop) {
                const hostPrefix = yield fs.promises
                    .readFile(path.join(qtPath, "bin", "target_qt.conf"), "utf8")
                    .then((data) => { var _a, _b; return (_b = (_a = data.match(/^HostPrefix=(.*)$/m)) === null || _a === void 0 ? void 0 : _a[1].trim()) !== null && _b !== void 0 ? _b : ""; })
                    .catch(() => "");
                if (hostPrefix) {
                    core.exportVariable("QT_HOST_PATH", path.resolve(qtPath, "bin", hostPrefix));
                }
            }
            core.addPath(path.resolve(qtPath, "bin"));
        }
    }
});
void run()
    .catch((err) => {
    var _a;
    if (err instanceof Error) {
        core.setFailed((_a = err.stack) !== null && _a !== void 0 ? _a : err);
    }
    else {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        core.setFailed(`unknown error: ${err}`);
    }
    process.exit(1);
})
    .then(() => {
    process.exit(0);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sS0FBSyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQzdCLE9BQU8sS0FBSyxPQUFPLE1BQU0sU0FBUyxDQUFDO0FBRW5DLE9BQU8sS0FBSyxLQUFLLE1BQU0sZ0JBQWdCLENBQUM7QUFDeEMsT0FBTyxLQUFLLElBQUksTUFBTSxlQUFlLENBQUM7QUFDdEMsT0FBTyxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFFcEQsT0FBTyxLQUFLLElBQUksTUFBTSxNQUFNLENBQUM7QUFDN0IsT0FBTyxFQUFFLE9BQU8sRUFBbUIsTUFBTSxrQkFBa0IsQ0FBQztBQUM1RCxPQUFPLGdDQUFnQyxDQUFDO0FBRXhDLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7QUFFN0IsTUFBTSxlQUFlLEdBQUcsQ0FBQyxFQUFVLEVBQUUsRUFBbUIsRUFBRSxFQUFVLEVBQVcsRUFBRTtJQUMvRSxPQUFPLE9BQU8sQ0FBQyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0FBQzdCLENBQUMsQ0FBQztBQUVGLE1BQU0saUJBQWlCLEdBQUcsQ0FBQyxJQUFZLEVBQUUsS0FBYSxFQUFRLEVBQUU7SUFDOUQsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztJQUNuQyxJQUFJLFFBQVEsR0FBRyxLQUFLLENBQUM7SUFDckIsSUFBSSxRQUFRLEVBQUUsQ0FBQztRQUNiLFFBQVEsR0FBRyxHQUFHLFFBQVEsSUFBSSxRQUFRLEVBQUUsQ0FBQztJ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