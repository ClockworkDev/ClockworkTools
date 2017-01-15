#!/usr/bin/env node
var fs = require('fs');
var path = require('path');
var os = require('os');
var spawn = require('child_process').spawn;

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
        case "deploy":
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
        var path = generatePackage(manifest);
        console.log("The package has been successfully generated, you can find it at "+path);
    } else {
        console.log("The current directory does not contain a Clockwork project");
    }
}

//Creates a Clockwork package using the given manifest
function generatePackage(manifest) {
    switch (os.type()) {
        case "Windows_NT":
            var results = [];
            var spawn = require("child_process").spawn;
            var child = spawn("powershell.exe", ["-Command", "-"]);
            child.stdout.on("data", function (data) {
                // console.log(data.toString());
            });
            child.stderr.on("data", function (data) {
                console.log(data.toString());
            });
            var workingPath = path.resolve("./");
            child.stdin.write('mkdir "' + workingPath + '\\HypergapPackageTemp" \n');
            child.stdin.write('Copy-Item "' + workingPath + '/manifest.json" "' + workingPath + '/HypergapPackageTemp" \n');
            child.stdin.write('Copy-Item "' + workingPath + '/' + manifest.scope + '" "' + workingPath + '/HypergapPackageTemp" -Recurse\n');
            child.stdin.write('Add-Type -A System.IO.Compression.FileSystem\n');
            child.stdin.write('If (Test-Path "' + workingPath + '\\' + manifest.name + '.hgp"){Remove-Item "' + workingPath + '\\' + manifest.name + '.hgp" }\n');
            child.stdin.write("[IO.Compression.ZipFile]::CreateFromDirectory('" + workingPath + "/HypergapPackageTemp', '" + workingPath + "/" + manifest.name + ".hgp')\n");
            child.stdin.write('Remove-Item "' + workingPath + '\\HypergapPackageTemp"-recurse\n');
            child.stdin.end();
            return workingPath + "/" + manifest.name + ".hgp";
        default:
            console.log("This OS is not supported yet");
            return false;
    }
}

//Reads the manifest in the working directory
function readManifest() {
    try {
        var manifest = require(path.resolve("./")+"/manifest.json");
        return manifest;
    } catch (e) {
        return null;
    }
}
