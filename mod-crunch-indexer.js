const fs = require("fs");
const path = require("path");
const shell = require(("shelljs"));
const node7zip = require('node-7zip');
const { resolve } = require("path");
const { exit } = require("process");
// const { stellarisToJson } = require('stellaris-to-json');
// const { exception } = require("console");
const sqlite3 = require('sqlite3').verbose();

const ModCrunchStellarisIndexer = () => {
    try {
        const USER_HOME = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
        const STELLARIS_ROOT = "C:/SteamHome/steamapps/common/Stellaris/";

        const PARADOX_STELLARIS_DOCS = path.join(USER_HOME, 'Documents/Paradox Interactive/Stellaris');
        const PARADOX_LANCHER_DATABASE_PATH = path.join(PARADOX_STELLARIS_DOCS, 'launcher-v2.sqlite');
        const PARADOX_STELLARIS_LOGS = path.join(PARADOX_STELLARIS_DOCS, 'logs');

        const STELLARIS_MODS = "C:/SteamHome/steamapps/common/Stellaris/mods";
        const INDEX_ROOT_ORG = "C:/StellarisIndex";
        // Future Parameters
        const ALL_MODS_ID = "ALL";
        const MOD_TITLE = "CursedGalaxy Playlist";


        const INDEX_ROOT_ALL = `${INDEX_ROOT_ORG}/001_AllMods`;
        const INDEX_ROOT_CRUNCH = `${INDEX_ROOT_ORG}/002_ModCrunch`;
        const PLAYSET_ID = "4cecc369-1d8d-4dc2-b97e-d610d9b1870f";
        const PLAYSET_NAME = "BCG - ExtraDollHouse";
        const CRUNCH_FILE = '.crunchfile.json';

        const indexedMods = {};
        let sequencerMod = null;
        let sequencerAll = null;
        let INDEX_MOD_ROOT = null;

        const INDEXED_MOD_DIRECTORIES = [
            'common',
            'events',
            'prescripted_countries',
            'map',

            'flags',
            'interface',
            'gfx',

            'music',
            'sound',
            'locales',
            'localisation',
            'fonts',
        ]

        const ScriptDangerPaths = [
            'common/on_actions/',
            'events',
        ]

        const GxfDangerPaths = [
            'interface',
            'gfx',
            'flags',
            'flags/colors.txt',
        ]

        const AbortException = (message, exception) => {
            console.error(`ERROR: ${message} because ${exception}`);
            if (exception.message) {
                console.error(`ERROR: ${exception.message}`);

            }
            if (exception.stack) {
                console.error(`ERROR: ${exception.stack}`);
            } 
            exit(1);
        }

        const WriteJSON = (root, file, object) => {
            try {
                fs.writeFileSync(path.join(root, file), EncodeJSON(object), 'utf8');
            } catch (exception) {
                AbortException(`Failed to write ${file}`, exception);
            }
        }

        const EncodeJSON = (object) => {
            return JSON.stringify(object, null, 2);
        }

        const LoadJSON = (root, file, defaultValues) => {
            try {
                const jsonPath = path.join(root, file);
                if (fs.existsSync(jsonPath)) {
                    return JSON.parse(fs.readFileSync(jsonPath, 'utf8').toString());
                } else {
                    return defaultValues;
                }
            } catch (exception) {
                AbortException(`Failed to read ${file}`, exception);
            }
        }


        const MkDir = (rootDirectory, filePath, ignoreErrors) => {
            let dirPath = rootDirectory;
            try {
                if (filePath !== undefined) {
                    dirPath = path.join(rootDirectory, filePath);
                }
                if (ignoreErrors) {
                    if (fs.existsSync(dirPath)) {
                        return;
                    }
                }
                fs.mkdirSync(dirPath);
                return dirPath;
            } catch (error) {
                if (ignoreErrors) {
                    console.warn(`WARNING: Error creating ${dirPath} (bypass OK)`);
                } else {
                    AbortException(`Failed to make directory: ${path}`, error);
                }
            }
        }

        const MkSym = (from, to, type, ignoreErrors) => {
            try {
                if (ignoreErrors) {
                    if (fs.existsSync(to)) {
                        return;
                    }
                }
                fs.symlinkSync(from, path.normalize(to), type);
            } catch (error) {
                if (!ignoreErrors) {
                    AbortException(`Failed to make Symlink: ${from} to ${to} of type ${type}`, error);
                } else {
                    console.warn(`WARNING: error creating symlink error: ${error.message} from ${from} to ${to} of type ${type}`);
                }
            }
        }

        class Sequencer {

            constructor(options) {
                this.options = options;
                if (!this.options.indexRoot) {
                    throw new exception('Sequencer Missing options.indexRoot.');
                }
                this.sequenceOrderIndex = options.startingIndex !== undefined ? options.startingIndex : 0;
                this.uniqueNames = {};
            }

            Add(mod) {
                try {
                    mod.sequence = this.sequenceOrderIndex.toString().padStart(this.options.padLen, this.options.padChar);
                    mod.indexDirectoryName = `${mod.sequence}-${mod.cleanName}`;
                    if (this.options.FileLoadOrder) {
                        mod.indexRoot = path.join(this.options.indexRoot, mod.indexDirectoryName);
                    } else {
                        mod.indexRoot = path.join(this.options.indexRoot, mod.cleanName);
                    }
                    mod.crunchConf = LoadJSON(mod.indexRoot, CRUNCH_FILE, {});
                    mod.identifier = this.Identify(mod);
                    // Start crunchfile in mod source root to make it easy to customize crunching
                    WriteJSON(mod.path, CRUNCH_FILE, mod);
                } catch (exception) {
                    throw exception;
                }
                this.sequenceOrderIndex += 1;
            }

            Identify(mod) {
                if (!mod.crunchConf.abbrev) {
                    let id = [];
                    if (mod.cleanName.length >= 6 && mod.cleanName.indexOf(' ') !== -1) {
                        const isAlphaNumeric = ch => {
                            return ch.match(/^[a-z0-9]+$/i) !== null;
                        }

                        const isAlpha = ch => {
                            return ch.match(/^[a-z]+$/i) !== null;
                        }

                        let splitIndex = 0;
                        const splitName = mod.cleanName.split(' ');
                        for (const str of splitName) {
                            if (str.length >= 3) {
                                for (const ch in mod.cleanName) {
                                    if (isAlpha(str)) {
                                        break;
                                    }
                                }
                            }
                            splitIndex++;
                        }
                        if (splitIndex < splitName.length) {
                            for (const str of mod.cleanName.split(' ')) {
                                if (str.length > 1) {
                                    if (str.length <= 3) {
                                        id.push(str);
                                    } else {
                                        id.push(str.substring(0, 3));
                                    }
                                }
                            }
                        } else {
                            id.push(`${mod.cleanName}-LONG-`);
                        }
                    } else {
                        id.push(mod.cleanName.substring(0, 6));
                    }
                    mod.crunchConf.abbrev = id.join('-').padEnd('_', 8).substring(0, 8).replace(' ', '_');
                    if (this.uniqueNames[mod.crunchConf.abbrev] !== undefined) {
                        console.warn(`Abbreviated name colission: ${mod.crunchConf.abbrev} is used by ${EncodeJSON(this.uniqueNames[mod.crunchConf.abbrev])}`);
                        mod.crunchConf.abbrev = `${mod.crunchConf.abbrev}-COLLISION-`;
                    }
                }
                this.uniqueNames[mod.crunchConf.abbrev] = mod.cleanName;
                return `${mod.sequence}-[${mod.crunchConf.abbrev}]-`.toLocaleUpperCase();
            }
        }

        const emptyDirectory = (path) => {
            if (!fs.existsSync(path)) return true;
            const files = fs.readdirSync(path);
            return (files.length === 0);
        }

        const startIndexing = (options) => {
            if (!fs.existsSync(STELLARIS_ROOT)) {
                throw new Error(`STELLARIS ROOT IS NOT CORRECT: ${STELLARIS_ROOT}`)
            }
            if (!emptyDirectory(INDEX_ROOT_ORG)) {
                console.error("ERROR: 🚀 Aborting! Must start with an empty Index Directory.");
                throw new Error(`ERROR: ${INDEX_ROOT_ORG} Directory is OCCUPIED.🚀 Please Delete manually and run again.`);
            }
            const INDEX_ROOT_LOAD_ORDER = `${INDEX_ROOT_ORG}/000_LoadOrder`;
            const INDEX_MOD_PUBLISH_ORDER = `${INDEX_ROOT_ORG}/000_${MOD_TITLE}`;
            if (!fs.existsSync(INDEX_ROOT_ORG)) {
                MkDir(INDEX_ROOT_ORG);
            }
            if (options.FileLoadOrder) {
                INDEX_MOD_ROOT = INDEX_ROOT_LOAD_ORDER;
            } else {
                INDEX_MOD_ROOT = INDEX_MOD_PUBLISH_ORDER;
            }

            sequencerMod = new Sequencer({ padChar: '0', padLen: 5, indexRoot: options.FileLoadOrder ?  INDEX_ROOT_LOAD_ORDER : INDEX_MOD_PUBLISH_ORDER});
            sequencerAll = new Sequencer({ padChar: 'X', padLen: 5, indexRoot: options.FileLoadOrder ?  INDEX_ROOT_LOAD_ORDER : INDEX_MOD_PUBLISH_ORDER});

            MkDir(INDEX_MOD_ROOT);        
            MkDir(INDEX_ROOT_ALL);
            MkDir(INDEX_ROOT_CRUNCH);

            /**
             * Create symlinks to log files and Stellaris Dirrectories fogit statr easy access.
             */
            // const LINKS_ROOT = `${USER_HOME}/code/CursedRepo/`;
            // const DEV_LINKS_INDEX = path.join(LINKS_ROOT, '_Links');
            // MkDir(DEV_LINKS_INDEX, '', true /** ignoreErrors */);
            // MkSym(STELLARIS_ROOT, path.join(DEV_LINKS_INDEX,'000_StellarisInstall'), 'dir', true        /** ignoreErrors */);
            // MkSym(PARADOX_STELLARIS_DOCS, path.join(DEV_LINKS_INDEX, '002_StellarisDocs'), 'dir', true  /** ignoreErrors */);
            // MkSym(PARADOX_STELLARIS_LOGS, path.join(DEV_LINKS_INDEX, '003_Logs'), 'dir', true           /** ignoreErrors */);
        }

        const indexModDirectory = (modSourceRoot, mod, options) => {
            if (indexedMods[mod.cleanName] !== undefined) {
                console.warn(`WARNING: Skipping Previously Indexed Mod: ${mod.cleanName}`);
                return;
            }
            console.log(`INDEXING: ${mod.cleanName} from=${modSourceRoot} to=${mod.indexRoot}`)
            indexedMods[mod.cleanName] = mod;
            if (!options.FileLoadOrder) {
                MkSym(modSourceRoot, path.normalize(mod.indexRoot), 'dir');
            } else {
                MkDir(mod.indexRoot);
            }
            if (options.FileLoadOrder) {
                for (const indexedModDirectory of INDEXED_MOD_DIRECTORIES) {
                    const modScanPath = path.join(modSourceRoot, indexedModDirectory);
                    if (fs.existsSync(modScanPath)) {
                        if (options.verbose) console.log(`        Indexing: ${modScanPath}`);
                        const indexFilePath = path.join(mod.indexRoot, indexedModDirectory);
                        MkDir(indexFilePath);
                        indexModFiles(mod, modScanPath, indexFilePath, options);
                    }
                }
            }
        }

        const indexModFiles = (mod, modScanPath, indexPath, options) => {
            if (!fs.existsSync(modScanPath)) {
                return;
            }
            if (!mod.identifier) {
                console.error("Mod Identifier Not Set! Aborting because of fishiness!");
                throw new Error("Missing Data: mod.identifier not set");
            }
            const files = fs.readdirSync(modScanPath);
            for (const file of files) {
                const modFilePath = path.join(modScanPath, file);
                const indexFilePath = path.join(indexPath, `${mod.identifier}-${file}`);
                const stat = fs.statSync(modFilePath);
                if (stat.isDirectory()) {
                    if (options.verbose) console.log(`       Directory: ${modFilePath} => ${indexFilePath}`);
                    MkDir(indexFilePath);
                    indexModFiles(mod, modFilePath, indexFilePath, options);
                } else if (stat.isFile()) {
                    if (options.verbose) console.log(`       Symlink: ${modFilePath} => ${indexFilePath}`);
                    MkSym(modFilePath, path.normalize(indexFilePath), 'file');
                }
            }
        }

        const addModToIndex = (mod, options) => {
            if (fs.existsSync(mod.path)) {
                if (!fs.existsSync(path.join(mod.path, '.skip'))) {
                    options.sequencer.Add(mod, options);
                    if (handleZipFile(mod)) {
                        console.info(`INFO: ARCHIVE-MOD ${mod.name} at ${mod.unzippedPath}`);
                        indexModDirectory(mod.unzippedPath, mod, options);
                    } else {
                        indexModDirectory(mod.path, mod, options);
                    }
                } else {
                    console.warn(`WARNING: .skip crunch for ${mod.name} at ${mod.path}`);
                }
            }
        }

        const promiseQuery = (sql) => {
            return new Promise((resolve, reject) => {
                let stellarisPlaylistDB;
                try {
                    console.log(`INFO: Opening Database: ${PARADOX_LANCHER_DATABASE_PATH}`);
                    const stellarisPlaylistDB = new sqlite3.Database(PARADOX_LANCHER_DATABASE_PATH);
                    stellarisPlaylistDB.all(sql, (err, results) => {
                        if (err) {
                            reject(err)
                        } else {
                            if (results === null) {
                                console.error(`ERROR: No results from query for playlist or mods. ${PARADOX_LANCHER_DATABASE_PATH}`);
                            }
                            resolve(results === null ? [] : results);
                        }
                    });
                } catch (err) {
                    reject(err);
                } finally {
                    if (stellarisPlaylistDB) {
                        stellarisPlaylistDB.close();
                    }
                }
            });
        }

        const loadModsFromLauncherDB = async (playsetName) => {
            return new Promise(async (resolve, reject) => {
                try {
                    const rows = [];
                    let sql = '';
                    if (playsetName !== "ALL") {
                        sql = `
                    select m.*, pm.*, p.* from playsets p
                        join playsets_mods pm on p.id = pm.playsetId
                        join mods m on pm.modId = m.id
                    where pm.enabled and status = 'ready_to_play' and p.name = "${playsetName}"
                    order by pm.position;`;
                    } else {
                        sql = `select m.* from mods m
                        where status = 'ready_to_play'
                        order by displayName desc;`;
                    }
                    const results = await promiseQuery(sql);
                    WriteJSON(INDEX_ROOT_CRUNCH, `${playsetName}-crunch-playlist.json`, results);
                    resolve(results);
                } catch (error) {
                    AbortException(`Failed to load ${playsetName} from Stellaris launcher`, err);
                }
            });
        }

        const indexMods = (results, options) => {
            for (const row of results) {
                const { dirPath, displayName } = row;
                if (dirPath == null || displayName == null) {
                    console.error("Invalid DB Results? Expecting dirPath and displayName!");
                    console.error(EncodeJSON(results));
                    exit(1);
                }
                addModToIndex({
                    name: row.displayName,
                    cleanName: fsCLean(row.displayName),
                    path: row.dirPath,
                    picture: row.thumbnailUrl,
                    tags: JSON.parse(row.tags),
                    remote_file_id: row.steamId,
                    registry_id: 'mod/ugc_1688887083.mod',
                    required_version: row.requiredVersion,
                    version: row.version,
                    position: row.position,
                    loadOrder: row.loadOrder,
                    playlist: row.name,
                    size: row.size,
                    playsetId: row.playsetId,
                }, options);
            }
        }

        function fsCLean(str) {
            return str.replace(/[\\/:*?\"<>|]/g, "").substring(0, 240);
        }

        function unquoteStr(str) {
            if (str.trim().substring(1) == '"') {
                let tmp = str.trim().substring(1);
                tmp = tmp.substring(0, tmp.length - 1);
                return tmp;
            }
            return str;
        }

        function handleZipFile(mod, modName) {
            if (mod.archivePath) {
                mod.unzippedPath = path.join(mod.indexRoot, 'Zipped');
                MkDir(mod.unzippedPath);
                node7zip.unzip(mod.archivePath, mod.unzippedPath);
                return true;
            }
            return false;
        }

        
        const Indexer = async () => {
            return new Promise(async (accept, reject) => {
                try {
                    // ultimate search order = Stellaris, Active Mod List, All Mods
                    const stellaris = {
                        name: 'Stellaris',
                        cleanName: 'Stellaris',
                        path: STELLARIS_ROOT
                    }

                    startIndexing({FileLoadOrder: false});
                    console.info(" *** Indexing Stellaris ***");
                    addModToIndex(stellaris, {
                        sequencer: sequencerMod,
                        indexRoot: INDEX_MOD_ROOT,
                        FileLoadOrder: false
                    });

                    console.info(" *** Indexing Stellaris Playlist ***");
                    let results = await loadModsFromLauncherDB(PLAYSET_NAME);
                    console.info(`        Loaded ${results.length} from DB`);
                    indexMods(results, {
                        sequencer: sequencerMod,
                        indexRoot: INDEX_MOD_ROOT,
                        FileLoadOrder: false
                    });

                    console.info(" *** Indexing All Mods ***");
                    results = await loadModsFromLauncherDB(ALL_MODS_ID);
                    console.log(`       Loaded ${results.length} from DB`);

                    indexMods(results, {
                        sequencer: sequencerAll,
                        indexRoot: INDEX_ROOT_ALL,
                        FileLoadOrder: false
                    });
                    console.info("*** Indexing Complete!! ***");
                    WriteJSON(INDEX_ROOT_CRUNCH, 'crunch.log', indexedMods);
                    resolve();
                } catch (error) {
                    AbortException(`Indexing Failed`, error);
                }
            });
        }
        return {
            Index: Indexer
        }
    } catch (exception) {
        AbortException(exception);
    }
}
module.exports = ModCrunchStellarisIndexer;