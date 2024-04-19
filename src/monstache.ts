import { Construct } from 'constructs';
import { TerraformStack } from 'cdktf';
import { getOpenstackProvider } from '../lib';
import { ComputeInstanceV2 } from '../.gen/providers/openstack';

export class MonstacheStack extends TerraformStack {
  constructor(scope: Construct, name: string) {
    super(scope, name);

    const serverConfig = scope.node.tryGetContext("serverConfig")

    // define resources here
    getOpenstackProvider(this);

    const monstacheImage = "rwynn/monstache:rel6";
    const mongodbUrl = "mongodb+srv://endpoint.mongo.dynamis.bbrfkr.net/?tls=false"
    const elasticsearchUrl = "http://endpoint.es.dynamis.bbrfkr.net"
    const installDocker = `
export DEBIAN_FRONTEND=noninteractive

# install docker
apt-get update
apt-get -y install ca-certificates curl gnupg lsb-release
mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get -y update && apt-get -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin
cat <<EOF > /etc/docker/daemon.json
{
  "mtu": 1450
}
EOF
systemctl restart docker
`;
    const settingMonstache = `
mkdir -p /etc/monstache
cat <<EOF > /etc/monstache/config.toml
mongo-url = "${mongodbUrl}"
elasticsearch-urls = ["${elasticsearchUrl}"]
cluster-name = "MonstacheCluster"
direct-read-namespaces = [""]
direct-read-dynamic-include-regex = "monstache-test\..*"

[[script]]
script = """
module.exports = function(doc) {
    if (doc.deleted) {
        return false;
    }
    delete doc.deleted;
    doc.added_field = doc.description + " added_info";
    return doc;
}
"""
EOF
cat <<EOF > /etc/monstache/compose.yaml
version: '3.9'
services:
  monstache:        
    image: ${monstacheImage}
    working_dir: /monstache
    command: -f ./config.toml
    volumes:
      - /etc/monstache:/monstache/
    restart: always
EOF
`;
    const startMonstache = `
cd /etc/monstache
docker compose up -d
`;

    for (const index in [...new Array(serverConfig.serverCount)]) {
      new ComputeInstanceV2(this, `Monstache${index}`, {
        name: `${serverConfig.serverNamePrefix}-${index}`,
        imageId: serverConfig.imageUuid,
        flavorName: serverConfig.flavorName,
        keyPair: serverConfig.keyPairName,
        securityGroups: serverConfig.securityGroupNames,
        network: [{ name: serverConfig.bootNetworkName }],
        userData: `#!/bin/sh
${installDocker}
${settingMonstache}
${startMonstache}
`,
        blockDevice: [
          {
            uuid: serverConfig.imageUuid,
            sourceType: "image",
            destinationType: "local",
            bootIndex: 0,
            deleteOnTermination: true,
          },
        ],
      });
    }
  }
}
