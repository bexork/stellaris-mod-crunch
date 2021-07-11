
import fs from 'fs'
import path from 'path'
import { unzip } from './archive.js'

import { conf } from '@starkeeper/stellaris-mission-control/core-conf.js'
import { makePng } from '@starkeeper/stellaris-mission-control/core-image.js'
import { getPlayset, getAllReadyToPlay } from '@starkeeper/stellaris-mission-control/core-db.js'

import { Sequencer } from './sequencer.js'
import {
  MkDir,
  MkSym,
  Exists,
  WriteJSON,
  WriteYAML,
  LoadJSON,
  AbortError,
  CleanFileSystemName,
  AbortException,
  // EmptyDirectory,
  logVerbose,
  logInfo,
  logWarn,
  MkDirPaths,
} from '@starkeeper/stellaris-mission-control/core-utils.js'

const ModCrunchStellarisIndexer = () => {
  // Future Parameters

  const indexedMods = {}
  const mergedIncludes = []

  const modSequencer = new Sequencer({ padChar: '0', padLen: 3, indexRoot: conf.index.mod })
  const allSequencer = new Sequencer({ padChar: 'X', padLen: 3, indexRoot: conf.index.all })
  const mergeSequencer = new Sequencer({ padChar: '0', padLen: 3, indexRoot: conf.index.merge, merge: true })

  /** Files that exist at root (Stellaris) but have been overriden */
  const rootOverrides = {}

  /** media included by mods */
  const includedMedia = []

  const IndexedModDirectories = [
    'common',
    'events',
    'flags',
    'fonts',
    'gfx',
    'interface',
    'locales',
    'localisation',
    'localisation_synched',
    'map',
    'music',
    'prescripted_countries',
    'sound'
  ]

  const assetTypes = ['.dds', '.tga', '.png', '.tiff', '.ogg', '.wav', '.mesh', '.anim']
  const imageTypes = ['.dds', '.tga', '.png', '.tiff']

  const isImage = (file) => imageTypes.includes(path.extname(file))
  const isAsset = (file) => assetTypes.includes(path.extname(file))

  // const ScriptDangerPaths = ['common/on_actions/', 'events']

  // const GxfDangerPaths = ['interface', 'gfx', 'flags', 'flags/colors.txt']
  const prepareOutputDirectories = () => {

    if (!fs.existsSync(conf.root)) {
      throw new Error(`STELLARIS ROOT IS NOT CORRECT: ${conf.root}`)
    }

    if (Exists(conf.index.root)) {
      RocketDirectory(conf.index.root)
    }

    if (Exists(conf.index.merge)) {
      if (conf.index.cleanMerge) {
        RocketDirectory(conf.index.merge)
      }
    }

    MkDir(conf.index.root, /** ifNotExist */ true)
    MkDir(conf.index.stellaris, /** ifNotExist */ true)
    MkDir(conf.index.mod, /** ifNotExist */ true)
    MkDir(conf.index.all, /** ifNotExist */ true)
    MkDir(conf.index.merge, /** ifNotExist */ true)
    MkDir(conf.index.mod_crunch, /** ifNotExist */ true)
    MkDir(conf.index.links, /** ifNotExist */ true)

    /**
     * Create symlinks to log files and Stellaris Dirrectories fogit statr easy access.
     */
    MkSym(conf.root, path.join(conf.index.links, '000_StellarisInstall'), 'dir')
    MkSym(conf.documents.root, path.join(conf.index.links, '002_StellarisDocuments'), 'dir')
    MkSym(conf.documents.logs, path.join(conf.index.links, '003_Logs'), 'dir')
  }

  const StartIndexing = () => {
    try {
      // ultimate search order = Stellaris, Active Mod List, All Mods
      const stellaris = {
        name: 'Stellaris',
        cleanName: 'Stellaris',
        abbrev: '[STELLA]',
        path: conf.root,
        stellaris: true
      }

      prepareOutputDirectories()

      logInfo(' *🚀* Indexing Stellaris Root *🚀*')
      addModToIndex(stellaris, {
        sequencer: modSequencer,
        indexRoot: conf.index.stellaris,
        merge: false
      })

      logInfo(' *🚀* Indexing Active Playlist *🚀*')
      const activePlayset = getPlayset()
      logInfo(`        Loaded ${activePlayset.length} from DB`)
      if (activePlayset.length > 0) {
        logInfo(` *🚀* Playlist: ${activePlayset[0].playsetName} *🚀*`)
      } else {
        logWarn('Active Playlist is EMPTY')
      }
      indexMods(activePlayset, {
        sequencer: modSequencer,
        indexRoot: conf.index.mod,
        merge: false
      })

      logInfo(' *🚀* Indexing All Installed Mods *🚀*')
      const allLoadedMods = getAllReadyToPlay()
      logInfo(`       Loaded ${allLoadedMods.length} from DB`)

      indexMods(allLoadedMods, {
        sequencer: allSequencer,
        indexRoot: conf.index.all,
        merge: false
      })

      logInfo(' *🚀* Indexing Stellaris Playlist For Mod Merge *🚀*')
      indexMods(activePlayset, {
        sequencer: mergeSequencer,
        indexRoot: conf.index.merge,
        merge: true,
        images: false
      })

      logInfo('*🚀* Indexing Complete!! *🚀*')
      WriteJSON(conf.index.mod_crunch, 'crunch.json',
        {
          rootOverrides,
          includedMedia,
          indexedMods,
          mergedIncludes,
        })

      WriteYAML(conf.index.merge, 'includes.yml', mergedIncludes)

    } catch (error) {
      AbortException('Indexing Failed', error)
    }
  }

  const addModToIndex = (mod, options) => {
    const crunchFile = LoadJSON(mod.path, '.crunch2')
    if (crunchFile) {
      options.crunch = crunchFile
    } else {
      options.crunch = {}
    }

    options.crunch.nomunge = true

    if (fs.existsSync(path.join(mod.path, '.skip'))) {
      logWarn(`WARNING: .skip crunch for ${mod.name} at ${mod.path}`)
      return
    }

    if (!options.merge) {
      if (indexedMods[mod.cleanName] !== undefined) {
        logWarn(`WARNING: Skipping Previously Indexed Mod: ${mod.cleanName}`)
        return
      }
      indexedMods[mod.cleanName] = mod
    }

    if (fs.existsSync(mod.path)) {
      options.sequencer.Add(mod, options)

      if (options.merge) {
        mergedIncludes.push({
          name: mod.name,
          version: mod.version,
          sequence: mod.sequence,
          identifier: mod.identifier,
          url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.steamId}`,
          picture: mod.pictureLink
        })
        logInfo(`MERGING: ${mod.cleanName} from=${mod.path} to=${mod.indexRoot}`)
      } else {
        logInfo(`INDEXING: ${mod.cleanName} from=${mod.path} to=${mod.indexRoot}`)
      }

      if (handleZipFile(mod)) {
        logWarn(`INFO: Archive File Mod ${mod.name} at ${mod.unzippedPath}`)
      }

      if (!options.merge) {
        MkSym(mod.path, mod.indexRoot, 'dir')
      } else {
        MkDir(mod.indexRoot, true)
        indexModDirectory(mod.path, mod, options)
      }
    } else {
      AbortError(`Attempted to index mod that was not installed correctlty at ${mod.path}`)
    }
  }

  const indexModDirectory = (modSourceRoot, mod, options) => {
    for (const modScanPath of IndexedModDirectories) {
      const modScanRoot = path.join(modSourceRoot, modScanPath)
      if (Exists(modScanRoot)) {
        const indexFilePath = path.join(mod.indexRoot, modScanPath)
        MkDir(indexFilePath, true /* ifNotExists */)
        indexModFiles(mod, modScanRoot, modScanPath, indexFilePath, options)
      }
    }
  }


  const RocketDirectory = (pathRoot) => {
    let index = 0
    let newPathName = false
    while (!newPathName) {
      console.warn(`🚀🚀🚀 ${pathRoot} (${index})`)
      const dir = path.dirname(pathRoot)
      const fname = path.basename(pathRoot)
      const tryPath = path.join(dir,  `${fname}-🚀(${index.toString().padStart(3,'0')})`)
      if (!Exists(tryPath)) {
        newPathName = tryPath
      }
      index += 1
      if (index > 100) {
        throw new Error(`Giving Up after ${index} tries. Something is wrong with this ${pathRoot} renaming to ${newPathName}`)
      }
    }
    console.warn(`🚀 Fresh Directory ${pathRoot} => previous: ${newPathName} is hiding`)
    fs.renameSync(pathRoot, newPathName)
    return newPathName
  }

  const RocketExtension = (pathRoot, mod) => {
    let index = 0
    let newPathName = false
    while (!newPathName) {
      console.warn(`🚀🚀🚀 ${pathRoot} (${index})`)
      const dir = path.dirname(pathRoot)
      const ext = path.extname(pathRoot)
      const file = path.basename(pathRoot, ext)
      MkDirPaths(dir, '.rocket', true)
      const tryPath = path.join(dir, '.rocket', `${file}-🚀(${index.toString().padStart(3,'0')})${ext}`)
      if (!Exists(tryPath)) {
        newPathName = tryPath
      }
      index += 1
      if (index > 100) {
        throw new Error(`Giving Up after ${index} tries. Something is wrong with this ${pathRoot} renaming to ${newPathName}`)
      }
    }
    console.warn(`🚀 ${mod.cleanName} replacing ${pathRoot} => previous: ${newPathName} will not be loaded`)
    fs.renameSync(pathRoot, newPathName)

    if (!mod.replacedFiles) mod.replacedFiles = []
    mod.replacedFiles.push(newPathName)
    return newPathName
  }


  const getMungedFileName = (mod, options, indexedModDirectory, indexPath, file) => {
    // check if the file exists in stellaris
    // and don't munge it if it does
    const modFile = path.join(mod.path, indexedModDirectory, file)
    const indexFile = path.join(mod.indexRoot, indexedModDirectory, file)
    const rootOverrideFile = path.join(conf.root, indexedModDirectory, file)
    const rootExists = Exists(rootOverrideFile)
    const unmungedFile = path.join(indexPath, file)
    const mungedFile = path.join(indexPath, `${mod.identifier}-${file}`)
    // const isImage = imageTypes.includes(path.extname(file))

    let result

    if (isAsset(file)) {
      result = unmungedFile
      console.warn(`Munger: Not Munging Media ${result}`)
    }

    if (!result && options.crunch.nomunge && rootExists) {
      result = unmungedFile
      console.warn(`Munger: Not munging ${result}`)
      if (rootExists) {
        // this is media or overriding a file
        rootOverrides[rootOverrideFile] = { rootOverrideFile, mod, modFile, indexFile }
        console.warn(`Munger: Overriding ${rootOverrideFile} ==> ${modFile}`)
      }
    }

    if (!result) {
      // this is not media and it is not overriding a file from root (Stellaris)
      result = mungedFile
      console.warn(`Munger: Munged ${path.join(indexPath, file)} => ${result}`)
    }

    if (Exists(result)) {
      // Expect to see renames of existing file
      console.warn(`Munger: File Exists in destination: ${result}`)
    }

    return result
  }

  const indexModFiles = (mod, modScanRoot, modScanPath, indexPath, options) => {
    const files = fs.readdirSync(modScanRoot, { withFileTypes: true})
    for (const dirEnt of files) {
      if (dirEnt.name[0] === '.') continue
      const modFilePath = path.join(modScanRoot, dirEnt.name)
      if (dirEnt.isDirectory()) {
        logVerbose(`       Directory: ${modFilePath} => ${indexPath}`)
        const newIndexDir = MkDirPaths(indexPath, dirEnt.name, true /** it might exist we are doing multiple mods */)
        indexModFiles(mod, modFilePath, path.join(modScanPath, dirEnt.name), newIndexDir, options)
      } else if (dirEnt.isFile()) {
        // names are munged with load order unless
        // this is an asset or it is replacing something from
        // Stellaris/Vanilla
        const indexFilePath = getMungedFileName(mod, options, modScanPath, indexPath, dirEnt.name)
        let rocketFile = false
        logVerbose(`       Symlink: ${modFilePath} => ${indexFilePath}`)
        if (Exists(indexFilePath)) {
          // Jet the other file on out like Elon Musk *🚀*
          rocketFile = RocketExtension(indexFilePath, mod)
        }
        // This file will be the loaded one
        MkSym(modFilePath, indexFilePath, 'file')

        // do images
        if (isAsset(dirEnt.name)) {
          includedMedia.push(modFilePath)
          if ((rocketFile || options.images) && isImage(dirEnt.name)) {
            // image thumbnails go in  .rocket-[steamId] folder to show which files are
            // being replaced by this mod
            const imageOutRoot = MkDirPaths(path.dirname(indexFilePath), `.rocket-${mod.steamId}`, true)
            makePng(modFilePath, 'current', 100, imageOutRoot)
            if (rocketFile) {
              makePng(rocketFile, 'previous', 100, imageOutRoot)
            }
          }
        }
      } else if (dirEnt.isSymbolicLink()) {
        console.warn('Warning: encountered a symlink while scanning. Are we scanning the correct directories?')
      }
    }
  }


  const indexMods = (results, options) => {
    for (const row of results) {
      addModToIndex(
        {
          name: row.displayName,
          path: row.dirPath,
          tags: JSON.parse(row.tags),
          steamId: row.steamId,
          requiredVersion: row.requiredVersion,
          picturePath: row.thumbnailPath,
          pictureLink: row.thumbnailUrl,
          version: row.version,
          cleanName: CleanFileSystemName(row.displayName),
          gameRegistryId: row.gameRegistryId,
          modSize: row.size,
          playsetId: row.playsetId,
          playsetName: row.playsetName,
          playsetModPosition: row.playsetModPosition,
          playsetLoadOrder: row.playsetLoadOrder,
          playsetIsActive: row.playsetIsActive,
        },
        options
      )
    }
  }

  const handleZipFile = (mod, options = {}) => {
    if (!mod.archivePath) return false
    unzip(mod.archivePath, mod.indexRoot)
    mod.unzippedPath = mod.indexRoot
    if (options.merge) {
      const modDescriptor = LoadJSON(mod.path, 'descriptor.mod')
      modDescriptor.crunchedPath = modDescriptor.path
      modDescriptor.oldArchivePath = modDescriptor.archivePath
      delete modDescriptor.archivePath
      modDescriptor.path          = mod.indexRoot
      WriteJSON(mod.path, 'descriptor.mod', modDescriptor)
    }
    return true
  }

  StartIndexing()
}

export { ModCrunchStellarisIndexer as default }
