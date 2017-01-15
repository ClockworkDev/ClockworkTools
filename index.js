#!/usr/bin/env node
var fs = require('fs');
var path = require('path');

var userArguments = process.argv.slice(2);
if (userArguments.length < 1) {
    console.log("No action was specified");
} else {
    switch (userArguments[0]) {
        case "init": //Create an empty project
            createProject(userArguments[1]);
            break;
        case "build": //Create an empty project
            break;
        case "deploy": //Create an empty project
            break;
        default: //Create an empty project
            console.log("The specified action was not recognized");
            break;
    }
}
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