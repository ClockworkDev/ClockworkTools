#!/usr/bin/env node
(function () {
    var fs = require('fs');
    var path = require('path');
    var os = require('os');
    var spawn = require('child_process').spawn;
    var parseString = require('xml2js').parseString;
    var ncp = require('ncp').ncp;
    var archiver = require('archiver');
    var request = require('request');
    var prompt = require('prompt');

    prompt.start();
    prompt.message = "Some information is required";

    var rootPath = "./";
    var log = function (x) { }; //By default, dont log anything
    var showError = function (x) { console.log(x); };//By default, output errors to the console

    var getDataViaPrompt = function (data, callback) { return prompt.get(data, callback); };

    var userArguments = process.argv.slice(2);

    var bridges = {
        web: require('clockwork-web-bridge'),
        uwp: require('clockwork-uwp-bridge')
    };

    if (userArguments.length < 1) {
        console.log("No action was specified, use 'clockwork ?' to see the available actions");
    } else {
        switch (userArguments[0]) {
            case "init":
                createProject(userArguments[1]);
                break;
            case "build":
                buildProject(function (x) { console.log("The package has been successfully generated, you can find it at " + x) });
                break;
            case "list":
                listPackages(userArguments[1]);
                break;
            case "add":
                addPackage(getDataViaPrompt, userArguments[1], userArguments[2]);
                break;
            case "update":
                updatePackage(userArguments[1]);
                break;
            case "register":
                prompt.get({
                    properties: {
                        username: {
                            description: 'Enter your username',
                            required: true
                        },
                        email: {
                            description: 'Enter your email',
                            pattern: /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/,
                            required: true,
                            message: 'This must be a valid email',
                        },
                        password: {
                            description: 'Enter your password',
                            hidden: true,
                            required: true,
                            replace: '*'
                        }
                    }
                }, function (err, result) {
                    register(result.username, result.email, result.password);
                });
                break;
            case "publish":
                prompt.get({
                    properties: {
                        sourceFile: {
                            description: 'Enter the location of the source file',
                            required: true
                        },
                        packageId: {
                            description: 'Enter the package name',
                            pattern: /^[a-zA-Z0-9]+$/,
                            message: 'Name must onyl contain alphanumeric characters',
                            required: true
                        },
                        packageVersion: {
                            description: 'Enter the package version',
                            pattern: /^[a-zA-Z0-9\.\-]+$/,
                            message: 'Name must only contain alphanumeric characters, dots and dashes',
                            required: true
                        }
                    }
                }, function (err, result) {
                    tryPublish(getDataViaPrompt, result.sourceFile, result.packageId, result.packageVersion);
                });
                break;
            case "bridge":
                runBridge(userArguments[1]);
                break;
            case "help":
            case "?":
                help();
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
                fs.mkdirSync(rootPath + path);
            } catch (e) {

            }
            if (folder.folders) {
                folder.folders.forEach(createFolder.bind(null, path));
            }
        }
        var newProject = require('./template/newProject.js');
        newProject.folders.forEach(createFolder.bind(null, ""));
        newProject.files.forEach(function (file) {
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
                fs.writeFile(rootPath + file.name, data, 'base64', function (err) {
                    if (err) throw err;
                });
            });
        });
    }

    //Looks for a project in the working directory and creates a Clockwork package
    function buildProject(callback) {
        var manifest = readManifest();
        if (manifest != null) {
            try {
                var path = generatePackage(manifest).then(callback);
            } catch (e) {
                showError("Error:" + e);
            }
        } else {
            console.log("The current directory does not contain a Clockwork project");
        }
    }

    //Creates a Clockwork package using the given manifest
    function generatePackage(manifest) {
        var workingPath = path.resolve(rootPath);
        try {
            fs.mkdirSync(workingPath + '/ClockworkPackageTemp');
        } catch (e) { }
        copyFileSync(workingPath + '/manifest.json', workingPath + '/ClockworkPackageTemp/manifest.json');
        return new Promise(function (res, rej) {
            console.log("Copying project files...");
            ncp(workingPath + '/' + manifest.scope, workingPath + '/ClockworkPackageTemp/' + manifest.scope, function (err) {
                if (err) {
                    console.error(err);
                    rej();
                } else {
                    res()
                }
            })
        }).then(function () {
            return preprocessPackage(workingPath + "/ClockworkPackageTemp");
        }).then(function (x) {
            return new Promise(function (res, rej) {
                try {
                    fs.unlinkSync(workingPath + "/" + manifest.name + '.cw');
                } catch (e) { }
                var output = fs.createWriteStream(workingPath + "/" + manifest.name + '.cw');
                var archive = archiver('zip');
                output.on('close', function () {
                    console.log("Deleting temporary files...");
                    deleteFolderRecursive(workingPath + "/ClockworkPackageTemp/");
                    res();
                });
                archive.on('error', function (err) {
                    throw err;
                });
                archive.pipe(output);
                console.log("Creating package..");
                archive.glob("**", {
                    cwd: workingPath + "/ClockworkPackageTemp/"
                })
                // archive.bulk([
                //     { expand: true, cwd: workingPath + "/ClockworkPackageTemp/", src: ['**'], dest: '' }
                // ]);
                archive.finalize();
            });
        }).then(function (x) { return workingPath + "/" + manifest.name + ".cw" });
    }

    //Reads the manifest in the working directory
    function readManifest(projectPath) {
        try {
            var manifest = JSON.parse(fs.readFileSync((projectPath || path.resolve(rootPath)) + "/manifest.json"));
            return manifest;
        } catch (e) {
            return null;
        }
    }

    //Writes the manifest in the working directory
    function writeManifest(manifest, callback, projectPath) {
        fs.writeFile((projectPath || path.resolve(rootPath)) + "/manifest.json", JSON.stringify(manifest), function (err) {
            if (callback) {
                callback(err)
            };
        });
    }

    //Run all the preprocessors on the package
    function preprocessPackage(path) {
        var manifest = readManifest();
        //Convert xml spritesheets to json
        return new Promise(function (resolvef, rejectf) {
            console.log("Processing levels...");
            var levels = manifest.levels.map(function (oldName, i) {
                if (oldName.indexOf(".xml") != -1) {
                    var newName = oldName.split(".xml").join(".json");
                    manifest.levels[i] = newName;
                    return new Promise(function (resolve, reject) {
                        log("Reading " + path + "/" + manifest.scope + "/" + oldName);
                        fs.readFile(path + "/" + manifest.scope + "/" + oldName, function (err, data) {
                            if (err) {
                                return console.error(err);
                            } else {
                                parseString(data, function (err, result) {
                                    if (err) {
                                        showError("There are errors in " + oldName + ", check your XML.");
                                        resolve();
                                    } else {
                                        log("Writing " + path + "/" + manifest.scope + "/" + newName);
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
                    return new Promise(function (resolve, reject) { return resolve() });
                }
            });
            var spritesheets = manifest.spritesheets.map(function (oldName, i) {
                console.log("Processing spritesheets...");
                if (oldName.indexOf(".xml") != -1) {
                    var newName = oldName.split(".xml").join(".json");
                    manifest.spritesheets[i] = newName;
                    return new Promise(function (resolve, reject) {
                        fs.readFile(path + "/" + manifest.scope + "/" + oldName, function (err, data) {
                            if (err) {
                                return console.error(err);
                            } else {
                                parseString(data, function (err, result) {
                                    if (err) {
                                        showError("There are errors in " + oldName + ", check your XML.");
                                        resolve();
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
                    return new Promise(function (resolve, reject) { return resolve() });
                }
            });
            Promise.all(levels.concat(spritesheets)).then(function (x) {
                console.log("Updating manifest...");
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
        if (thisspritesheet.$.positionBasedOptimizations != undefined) {
            newspritesheet.positionBasedOptimizations = thisspritesheet.$.positionBasedOptimizations;
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
            newspritesheet.frames[frame.$.name] = newframe;
        });
        thisspritesheet.layers[0].layer.forEach(function (layer) {
            var newlayer = new Layer();
            newlayer.x = layer.$.x;
            newlayer.y = layer.$.y;
            newlayer.frames = layer.frame ? layer.frame.map(function (f) { return f.$.name; }) : [];
            newspritesheet.layers[layer.$.name] = newlayer;
        });
        thisspritesheet.states[0].state.forEach(function (state) {
            var newstate = new State();
            newstate.layers = state.layer ? state.layer.map(function (l) { return l.$.name; }) : [];
            if (state.$.flip) {
                newstate.flip = state.$.flip;
            }
            newspritesheet.states[state.$.name] = newstate;
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



    ///CWPM

    function listPackages(packageId) {
        if (packageId) {
            request('http://cwpm.azurewebsites.net/api/packages/' + packageId, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log("Versions of " + packageId + ":");
                    var packages = JSON.parse(body);
                    packages.forEach(function (p) {
                        console.log(" " + p.version + " published at " + p.date);
                    });
                }
            });
        } else {
            request('http://cwpm.azurewebsites.net/api/packages', function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log("Packages published:");
                    var packages = JSON.parse(body);
                    packages.forEach(function (p) {
                        console.log(" " + p.id + " by " + p.by);
                    });
                }
            });
        }
    }

    function register(username, email, password) {
        request.post({ url: 'http://cwpm.azurewebsites.net/api/developers', form: { name: username, email: email, password: password } }, function (err, httpResponse, body) {
            if (JSON.parse(body).res == "OK") {
                console.log("User registered successfully");
            } else {
                console.log("Error registering your account. Maybe that username is already taken?");
            }
        })
    }

    function tryPublish(getData, sourceFile, packageId, packageVersion) {
        request('http://cwpm.azurewebsites.net/api/packages/' + packageId, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var packages = JSON.parse(body);
                var existing = packages.filter(function (p) {
                    return p.version == packageVersion;
                });
                if (existing.length == 0) {
                    publish(getData, sourceFile, packageId, packageVersion);
                } else {
                    getData({
                        properties: {
                            confirm: {
                                description: 'This package/version is already published, do you want to overwrite it? (Y/N)',
                                pattern: /Y|N/,
                                required: true
                            },
                        }
                    }, function (err, result) {
                        if (result.confirm == "Y") {
                            publish(getData, sourceFile, packageId, packageVersion);
                        }
                    });
                }
            }
        });
    }

    function publish(getData, sourceFile, packageId, packageVersion) {
        fs.readFile(sourceFile, function (err, data) {
            getData({
                properties: {
                    username: {
                        description: 'Enter your username',
                        required: true
                    },
                    password: {
                        description: 'Enter your password',
                        hidden: true,
                        required: true,
                        replace: '*'
                    }
                }
            }, function (err, result) {
                request.post('http://cwpm.azurewebsites.net/api/packages/' + packageId + "/" + packageVersion, {
                    form: {
                        username: result.username,
                        password: result.password,
                        source: data,
                    }
                }, function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        console.log("Package published!");
                    } else {
                        console.log(body);
                    }
                });
            });
        });
    }

    function addPackage(getData, packageName, packageVersion) {
        if (typeof packageName === 'undefined') {
            console.log("You must specify a module");
            return;
        }
        var manifest = readManifest();
        if (manifest == null) {
            console.log("There is no Clockwork project in the working folder");
            return;
        }
        if (typeof manifest.dependencies[packageName] === 'undefined') {
            continueAddPackage();
        } else {
            getData({
                properties: {
                    confirm: {
                        description: 'This package is already a dependency, do you want to change the version? (Y/N)',
                        pattern: /Y|N/,
                        required: true
                    },
                }
            }, function (err, result) {
                if (result.confirm == "Y") {
                    continueAddPackage();
                }
            });
        }
        function continueAddPackage() {
            request('http://cwpm.azurewebsites.net/api/packages/' + packageName, function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    var packages = JSON.parse(body);
                    if (packages.length == 0) {
                        console.log("This package can't be found on the online repository.");
                        return;
                    }
                    if (typeof packageVersion === 'undefined') {
                        var lastVersion = packages.sort(function (a, b) { return new Date(b.date) - new Date(a.date) })[0].version;
                        manifest.dependencies[packageName] = lastVersion
                        writeManifest(manifest, function (err) {
                            if (err) {
                                console.log("An error happened while trying to update the manifest");
                            } else {
                                console.log("Version " + lastVersion + " of " + packageName + " added to the dependencies");
                            }
                        });
                    } else {
                        if (packages.filter(function (p) { return p.version == packageVersion; }).length > 0) {
                            manifest.dependencies[packageName] = packageVersion;
                            writeManifest(manifest, function (err) {
                                if (err) {
                                    console.log("An error happened while trying to update the manifest");
                                } else {
                                    console.log("Version " + packageVersion + " of " + packageName + " added to the dependencies");
                                }
                            });
                        } else {
                            console.log("This version can't be found. Please list all the published versions with 'clockwork list " + packageName + "'");
                        }
                    }
                }
            });
        }

    }


    function updatePackage(packageName) {
        var manifest = readManifest();
        if (manifest == null) {
            console.log("There is no Clockwork project in the working folder");
            return;
        }
        if (typeof packageName === 'undefined') {
            Promise.all(Object.keys(manifest.dependencies).map(function (x) { return updateDependencyPromise(x) })).then(function () {
                writeManifest(manifest);
            });
        } else {
            updateDependencyPromise(packageName).then(function () {
                writeManifest(manifest);
            });
        }

        function updateDependencyPromise(packageName) {
            return new Promise(function (resolve, reject) {
                request('http://cwpm.azurewebsites.net/api/packages/' + packageName, function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        var packages = JSON.parse(body);
                        if (packages.length == 0) {
                            console.log("No versions of the module " + packageName + " have been found in the online repository.");
                        } else {
                            var lastVersion = packages.sort(function (a, b) { return new Date(b.date) - new Date(a.date) })[0].version;
                            if (manifest.dependencies[packageName] != lastVersion) {
                                console.log(packageName + " updated from " + manifest.dependencies[packageName] + " to " + lastVersion);
                                manifest.dependencies[packageName] = lastVersion;
                            } else {
                                console.log(packageName + " is already up to date");
                            }
                        }
                        resolve();
                    }
                });
            });
        }
    }


    function runBridge(name, callback) {
        if (bridges[name]) {
            buildProject(function (packageName) {
                if (!fs.existsSync(name)) {
                    fs.mkdirSync(name);
                }
                bridges[name](packageName, name);
                if (callback) {
                    callback(true);
                }
            });
        } else {
            console.log("This bridge can't be found, the following bridges are available:");
            for (var bridge in bridges) {
                console.log(" " + bridge);
            }
            if (callback) {
                callback(false);
            }
        }
    }

    //Help

    function help() {
        console.log("The following commands are allowed:");
        console.log("\n > clockwork init <projectName>");
        console.log("   Creates an empty Clockwork project in the working directory");
        console.log("\n > clockwork build");
        console.log("   Builds the Clockwork project in the working directory, generating a .cw file");
        console.log("\n > clockwork list");
        console.log("   Lists the Clockwork modules available in the online repository");
        console.log("\n > clockwork list <moduleName>");
        console.log("   Lists the versions of that module available in the online repository");
        console.log("\n > clockwork add <moduleName>");
        console.log("   Adds the last version of the specified module as a dependency of the current project");
        console.log("\n > clockwork add <moduleName> <moduleVersion>");
        console.log("   Adds the specified version of the specified module as a dependency of the current project");
        console.log("\n > clockwork update <moduleName>");
        console.log("   Updates the dependency to the specified package to the latest published version");
        console.log("\n > clockwork update");
        console.log("   Updates the dependencies to all the packages to the latest published versions");
        console.log("\n > clockwork register");
        console.log("   Registers a developer account, allowing you to publish Clockwork modules");
        console.log("\n > clockwork publish");
        console.log("   Publishes a module in the Clockwork online repository");
        console.log("\n > clockwork bridge <bridgeName>");
        console.log("   Uses the specified bridge to export the game");
    }


    module.exports = function (cwd, getData, logFunction, showErrorMessage) {
        rootPath = cwd;
        if (logFunction) {
            log = logFunction;
        }
        if (showErrorMessage) {
            showError = showErrorMessage;
        }
        return {
            createProject: createProject,
            buildProject: buildProject,
            listPackages: listPackages,
            addPackage: addPackage.bind(null, getData),
            updatePackage: updatePackage,
            register: register,
            tryPublish: tryPublish.bind(null, getData),
            runBridge: runBridge
        }
    };

})();