import { App } from "cdktf";
import { MonstacheStack } from "./src/monstache";

const app = new App();
new MonstacheStack(app, "monstache-on-openstack");
app.synth();
