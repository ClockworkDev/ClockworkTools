CLOCKWORKRT.components.register([
    {
        name: "talkingDog",
        sprite: "dog",
        events: [
            {
                name: "#setup", code: function (event) {
                    this.engine.debug.log("Object loaded");
                    this.var.$text = "";
                    this.var.timer = 0;
                }
            },
            {
                name: "#loop", code: function (event) {
                    this.var.timer++;
                    if (this.var.timer == 100) {
                        this.var.$text = "Hello World";
                        this.var.$state = "BarkL";
                    }
                    if (this.var.timer == 150) {
                        this.engine.debug.log("Time to go");
                        this.var.$text = "";
                        this.var.$state = "RunR";
                    }
                    if (this.var.timer > 150) {
                        this.var.$x += 5;
                    }
                }
            }]
    }]);