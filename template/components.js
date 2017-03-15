CLOCKWORKRT.components.push([
    {
        name: "talkingDog",
        sprite: "dog",
        events: [
            {
                name: "#setup", code: function (event) {
                    console.log("Preset loaded");
                    this.var.$text = "";
                    this.var.timer = 0;
                }
            },
            {
                name: "#loop", code: function (event) {
                    console.log("Preset loaded");
                    this.var.timer++;
                    if (this.var.timer == 100) {
                        this.var.$text = "Hello World";
                        this.var.$state = "BarkL";
                    }
                    if (this.var.timer == 150) {
                        this.var.$text = "";
                        this.var.$state = "RunR";
                    }
                    if (this.var.timer > 150) {
                        this.var.$x += 5;
                    }
                }
            }]
    }]);