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
console.log("hello, GitHub!");
console.log("1!");
console.log("2!");
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUFBLE9BQU8sS0FBSyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ2pDLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sS0FBSyxJQUFJLE1BQU0sTUFBTSxDQUFDO0FBQzdCLE9BQU8sS0FBSyxPQUFPLE1BQU0sU0FBUyxDQUFDO0FBRW5DLE9BQU8sS0FBSyxLQUFLLE1BQU0sZ0JBQWdCLENBQUM7QUFDeEMsT0FBTyxLQUFLLElBQUksTUFBTSxlQUFlLENBQUM7QUFDdEMsT0FBTyxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsTUFBTSxlQUFlLENBQUM7QUFFcEQsT0FBTyxLQUFLLElBQUksTUFBTSxNQUFNLENBQUM7QUFDN0IsT0FBTyxFQUFFLE9BQU8sRUFBbUIsTUFBTSxrQkFBa0IsQ0FBQztBQUM1RCxPQUFPLGdDQUFnQyxDQUFDO0FBRXhDLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxDQUFDLENBQUM7QUFDN0IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQzlCLE9BQU8sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDbEIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUVsQixNQUFNLGVBQWUsR0FBRyxDQUFDLEVBQVUsRUFBRSxFQUFtQixFQUFFLEVBQVUsRUFBVyxFQUFFO0lBQy9FLE9BQU8sT0FBTyxDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFDN0IsQ0FBQyxDQUFDO0FBRUYsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLElBQVksRUFBRSxLQUFhLEVBQVEsRUFBRTtJQUM5RCxNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsR0FB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