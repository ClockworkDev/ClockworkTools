exports.files = [
    {
        name: "manifest.json", file: "template/manifest.json", template:true
    },
    {
        name: "gameFiles/components.js", file: "template/components.js"
    },
    {
        name: "gameFiles/levels.xml",file: "template/levels.xml"
    },
    {
        name: "gameFiles/spritesheets.xml",file: "template/spritesheets.xml"
    },
    {
        name: "gameFiles/images/dog.png", file: "template/dog.png"
    },
    {
        name: "gameFiles/tileIcon.png", file: "template/tileIcon.png"
    },
];

exports.folders = [
    {
        name: "gameFiles", folders: [
            { name: "images" }
        ]
    }
]