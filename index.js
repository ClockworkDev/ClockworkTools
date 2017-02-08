#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var os = require('os');
var spawn = require('child_process').spawn;
var parseString = require('xml2js').parseString;
var ncp = require('ncp').ncp;
var archiver = require('archiver');

var userArguments = process.argv.slice(2);
if (userArguments.length < 1) {
    console.log("No action was specified");
} else {
    switch (userArguments[0]) {
        case "init":
            createProject(userArguments[1]);
            break;
        case "build":
            buildProject();
            break;
        default:
            console.log("The specified action was not recognized");
            break;
    }
}

//Create a project following the template in the working directory with the specified name
function createProject(projectName) {
    if (projectName === undefined) {
        console.log("No name was specified for the project");
        return;
    }
    function createFolder(path, folder) {
        path = path + "/" + folder.name;
        try {
            fs.mkdirSync("./" + path);
        } catch (e) {

        }
        if (folder.folders) {
            folder.folders.forEach(createFolder.bind(null, path));
        }
    }
    var newProject = require('./template/newProject.js');
    newProject.folders.forEach(createFolder.bind(null, ""));
    newProject.files.forEach(file => {
        fs.readFile(__dirname + "/" + file.file, 'base64', function (err, data) {
            if (err) {
                return console.log(err);
            }
            if (file.template) {
                var b = new Buffer(data, 'base64');
                var content = b.toString().replace("#projectName#", projectName);
                b = new Buffer(content);
                data = b.toString('base64');
            }
            fs.writeFile("./" + file.name, data, 'base64', function (err) {
                if (err) throw err;
            });
        });
    });
}

//Looks for a project in the working directory and creates a Clockwork package
function buildProject() {
    var manifest = readManifest();
    if (manifest != null) {
        var path = generatePackage(manifest).then(x => console.log("The package has been successfully generated, you can find it at " + x));
    } else {
        console.log("The current directory does not contain a Clockwork project");
    }
}

//Creates a Clockwork package using the given manifest
function generatePackage(manifest) {
    var workingPath = path.resolve("./");
    try {
        fs.mkdirSync(workingPath + '/ClockworkPackageTemp');
    } catch (e) { }
    copyFileSync(workingPath + '/manifest.json', workingPath + '/ClockworkPackageTemp/manifest.json');
    return new Promise((res, rej) => {
        ncp(workingPath + '/' + manifest.scope, workingPath + '/ClockworkPackageTemp/' + manifest.scope, function (err) {
            if (err) {
                console.error(err);
                rej();
            } else {
                res()
            }
        })
    }).then(function () {
        return preprocessPackage(workingPath + "\\ClockworkPackageTemp");
    }).then(x => {
        return new Promise((res, rej) => {
            try {
                fs.unlinkSync(workingPath + "/" + manifest.name + '.cw');
            } catch (e) { }
            var output = fs.createWriteStream(manifest.name + '.cw');
            var archive = archiver('zip');
            output.on('close', function () {
                deleteFolderRecursive(workingPath + "/ClockworkPackageTemp/");
                res();
            });
            archive.on('error', function (err) {
                throw err;
            });
            archive.pipe(output);
            archive.glob("**",{
                cwd:workingPath + "/ClockworkPackageTemp/"
            })
            // archive.bulk([
            //     { expand: true, cwd: workingPath + "/ClockworkPackageTemp/", src: ['**'], dest: '' }
            // ]);
            archive.finalize();
        });
    }).then(x => workingPath + "/" + manifest.name + ".cw");
}

//Reads the manifest in the working directory
function readManifest(projectPath) {
    try {
        var manifest = require((projectPath || path.resolve("./")) + "/manifest.json");
        return manifest;
    } catch (e) {
        return null;
    }
}

//Run all the preprocessors on the package
function preprocessPackage(path) {
    var manifest = readManifest();
    //Convert xml spritesheets to json
    return new Promise((resolvef, rejectf) => {
        var levels =manifest.levels.map(function (oldName, i) {
            if (oldName.indexOf(".xml") != -1) {
                var newName = oldName.split(".xml").join(".json");
                manifest.levels[i] = newName;
                return new Promise((resolve, reject) => {
                    fs.readFile(path + "/" + manifest.scope + "/" + oldName, function (err, data) {
                        if (err) {
                            return console.error(err);
                        } else {
                            parseString(data, function (err, result) {
                                if (err) {
                                    return console.error(err);
                                } else {
                                    fs.writeFile(path + "/" + manifest.scope + "/" + newName, JSON.stringify(XMLlevelsToJson(result)), function (err) {
                                        if (err) {
                                            return console.error(err);
                                        }
                                        resolve();
                                    });
                                }
                            });
                        }
                    });
                });
            } else {
                return new Promise((resolve, reject) => { resolve() });
            }
        });
        var spritesheets =manifest.spritesheets.map(function (oldName, i) {
            if (oldName.indexOf(".xml") != -1) {
                var newName = oldName.split(".xml").join(".json");
                manifest.spritesheets[i] = newName;
                return new Promise((resolve, reject) => {
                    fs.readFile(path + "/" + manifest.scope + "/" + oldName, function (err, data) {
                        if (err) {
                            return console.error(err);
                        } else {
                            parseString(data, function (err, result) {
                                if (err) {
                                    return console.error(err);
                                } else {
                                    fs.writeFile(path + "/" + manifest.scope + "/" + newName, JSON.stringify(XMLspritesheetsToJson(result)), function (err) {
                                        if (err) {
                                            return console.error(err);
                                        }
                                        resolve();
                                    });
                                }
                            });
                        }
                    });
                });
            } else {
                return new Promise((resolve, reject) => { resolve() });
            }
        });
        Promise.all(levels.concat(spritesheets)).then(x => {
            fs.writeFile(path + "/manifest.json", JSON.stringify(manifest), function (err) {
                if (err) {
                    return console.error(err);
                }
                resolvef();
            });
        });
    });
}

//Levels logic

function XMLlevelsToJson(result) {
    return result.levels.level.map(XMLlevelToJson);
}

function XMLlevelToJson(thislevel) {
    var level = {};
    level.id = thislevel.$.id;
    level.objects = thislevel.object.map(function (thisobject) {
        var object = {};
        //Set name
        object.name = thisobject.$.name
        //Set type
        if (thisobject.type && thisobject.type.length > 0) {
            //Composition
            object.type = thisobject.type.map(function (x) { return x.$.id; });
        } else {
            //Inheritance
            object.type = thisobject.$.type;
        }
        //Set spritesheet
        object.sprite = thisobject.$.spritesheet ? thisobject.$.spritesheet : null;
        //Set whether the object is static
        object.isstatic = thisobject.$.static ? thisobject.$.static : null;
        //Set x,y,z
        object.x = +thisobject.$.x;
        object.y = +thisobject.$.y;
        object.z = thisobject.$.z ? +thisobject.$.z : null;
        //Set vars
        object.vars = thisobject.$.vars ? JSON.parse(thisobject.$.vars) : {};
        return object;
    });
    return level;
}

//Spritesheets logic

function XMLspritesheetsToJson(result) {
    return result.spritesheets.spritesheet.map(XMLspritesheetToJson);
}

function Spritesheet() {
    this.name = "";
    this.img;
    this.states = {}
    this.layers = {}
    this.frames = {};
}

function State() {
    this.layers = [];
}

//Holds a layer: Body, arms...
function Layer() {
    this.frames = [];
    this.x;
    this.y;
}

//Holds a single frame
function Frame(x, y, w, h, t) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.t = t;
}

function XMLspritesheetToJson(thisspritesheet) {
    var newspritesheet = new Spritesheet();
    newspritesheet.name = thisspritesheet.$.name;
    if (thisspritesheet.$.src != undefined) {
        newspritesheet.src = thisspritesheet.$.src;
    }
    thisspritesheet.frames[0].frame.forEach(function (frame) {
        var newframe = new Frame();
        if (frame.$.code == undefined) {
            if (frame.$.fullTexture) {
                newframe.fullTexture = true;
            } else {
                newframe.x = +frame.$.x;
                newframe.y = +frame.$.y;
                newframe.w = +frame.$.w
                newframe.h = +frame.$.h;
            }
        } else {
            newframe.code = frame.$.code;
        }
        newframe.t = +frame.$.t;
        newspritesheet.frames[frame.$.name]= newframe;
    });
    thisspritesheet.layers[0].layer.forEach(function (layer) {
        var newlayer = new Layer();
        newlayer.x =  layer.$.x;
        newlayer.y =  layer.$.y;
        newlayer.frames= layer.frame.map(function(f){return f.$.name;});
        newspritesheet.layers[layer.$.name]= newlayer;
    });
    thisspritesheet.states[0].state.forEach(function (state) {
        var newstate = new State();
        newstate.layers = state.layer.map(function(l){return l.$.name;});
        if(state.$.flip){
            newstate.flip = state.$.flip;
        }
        newspritesheet.states[state.$.name]= newstate;
    });
    return newspritesheet;
}

//File system helpers

function copyFileSync(srcFile, destFile) {
    var content = fs.readFileSync(srcFile);
    fs.writeFileSync(destFile, content);
}
function deleteFolderRecursive(path) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach(function (file, index) {
            var curPath = path + "/" + file;
            if (fs.lstatSync(curPath).isDirectory()) { // recurse
                deleteFolderRecursive(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
};