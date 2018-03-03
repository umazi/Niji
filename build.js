var fs = require('fs')
var JsonCSS = new (require('json-css'))
var sass = require('node-sass')
var plist = require('plist')



// e.g. 'markup.list.unnumbered,\r\nmarkup.list.numbered'
function handleMultipleScopes(key) {
    let scopes = key.split(/,\s*\r*\n*/).map(x => x.trim())
    return scopes
}


function getJson(scssFile) {
    let sassResult = sass.renderSync({
        file: scssFile,
    });
    let cssContent = sassResult.css.toString()
    let jsonContent = JsonCSS.toJSON(cssContent)

    return jsonContent
}


function getThemeJson(scssFile, metainfo) {
    let theme = Object.assign({}, metainfo)
    theme.settings = []

    let jsonContent = getJson(scssFile)

    for (key of Object.keys(jsonContent)) {
        if (key === '*') {
            theme.settings.push({'settings': jsonContent['*']})
            continue
        }
        let scopes = handleMultipleScopes(key)
        scopes.forEach(scope => {
            theme.settings.push({'scope': scope,
                                 'settings': jsonContent[key]})
        })
    }

    return theme
}


function makeDir(path) {
    let re = /\//g
    let paths = []
    while (re.exec(path) !== null) {
        paths.push(path.slice(0, re.lastIndex))
    };
    paths.push(path)
    for (let p of paths) {
        try {
            fs.accessSync(p)
        }
        catch (err) {
            if (err.code != 'ENOENT') {throw err}
            fs.mkdirSync(p)
        }
    }
}


// write vscode extension package.json
function writePackage(vscthemes) {
    let pack = JSON.parse(fs.readFileSync('package.json', 'utf-8'))

    if (pack.contributes) {
        pack.contributes.themes = vscthemes
    }
    else {
        pack.contributes = {}
        pack.contributes.themes = vscthemes
    }
    fs.writeFileSync('package.json', JSON.stringify(pack, null, 4), 'utf-8')

}


function getWorkbenchCol(defaultJson, benchJson) {
    let defaultCol = JSON.parse(fs.readFileSync(`${defaultJson}`, 'utf-8'))
    let benchCol = JSON.parse(fs.readFileSync(`${benchJson}`, 'utf-8'))
    return Object.assign({}, defaultCol, benchCol)
}


// handling the differences of the scopes between sublime and vscode
function handleDiffScopes(themeJsonData, diffScopesFile) {
    let diff_scopes = JSON.parse(fs.readFileSync(diffScopesFile, 'utf-8'))
    let tm_scopes = Object.keys(diff_scopes)
    let col_settings = {}

    for (let i of themeJsonData.settings) {
        if (i.scope) {
            col_settings[i.scope] = i.settings
        }
    }

    let vscJsonData = JSON.parse(JSON.stringify(themeJsonData))
    tm_scopes.forEach(scope => {
        vscJsonData.settings.push({'scope': diff_scopes[scope],
                                   'settings': col_settings[scope]})
    })

    return vscJsonData
}


function buildTheme({settings = 'meta.json',
                     ignore = [],
                     themeType = 'all',
                     releasePath = './release'} = {}) {

    let meta = fs.readFileSync(settings, 'utf-8')
    meta = JSON.parse(meta)
    let themeNames = Object.keys(meta)

    let themesList = []

    themeNames.forEach(name => {
        for (let j of ignore) {
            if (name.match(new RegExp(j, 'i'))) {
                return 0
            }
        }

        let themeJson = getThemeJson(meta[name].file, meta[name].info)

        // build tmTheme
        if (themeType.toLowerCase() === 'tm'
            || themeType.toLowerCase() === 'all') {

            // preventing no directory error
            makeDir(`${releasePath}/tmTheme`)

            fs.writeFileSync(
                `${releasePath}/tmTheme/${meta[name].info.name}.tmTheme`,
                plist.build(themeJson), 'utf-8')

        }

        // build vscode theme
        if (themeType.toLowerCase() === 'vsc'
            || themeType.toLowerCase() === 'all') {

            themeJson.type = meta[name].type

            if (!meta[name].workbench) {
                return 0
            }

            // let workbench = JSON.parse(
            //     fs.readFileSync(meta[name].workbench, 'utf-8'))
            // themeJson.colors = workbench.colors

            let vscJson = handleDiffScopes(themeJson,
                                           './themes/diffscopes.json')

            vscJson.colors = getWorkbenchCol(meta[name].workbenchdefault,
                                             meta[name].workbench)

            vscJson.tokenColors = vscJson.settings
            delete vscJson.settings

            makeDir(`${releasePath}/vscTheme`)

            fs.writeFileSync(
                `${releasePath}/vscTheme/${meta[name].info.name}.json`,
                JSON.stringify(vscJson, null, 4), 'utf-8')

            // write vscode extension package.json
            let vstype = meta[name].type
            if (vstype === 'light') {vstype = 'vs'}
            else {vstype = 'vs-dark'}
            let info = {
                "label": meta[name].info.name,
                "uiTheme": `${vstype}`,
                "path": `${releasePath}/vscTheme/${meta[name].info.name}.json`
            }
            themesList.push(info)

        }

    })

    writePackage(themesList)

}


// buildTheme({ignore: ['shine', 'smile']})
// buildTheme({themeType: 'vsc', ignore: ['shine', 'smile']})
buildTheme({themeType: 'all', ignore: []})
