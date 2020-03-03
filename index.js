#! /usr/bin/env node

const inquirer = require('inquirer');
const fs = require('fs');
const jsonfile = require('jsonfile');
const promisify = require("es6-promisify");
const Mustache = require('mustache');
const exec = promisify(require('child_process').exec);

const DIR = __dirname;

if(!fs.existsSync(DIR + '/config.json')) {

    // Create config
    inquirer.prompt([{

        type: 'input',
        name: 'vagrantPath',
        message: 'Vagrant server path'

    }, {

        type: 'input',
        name: 'configPath',
        message: 'Apache configs path',
        default: answers => {
            return answers.vagrantPath + '/config'
        }
    }, {

        type: 'input',
        name: 'vagrantIp',
        message: 'Vagrant IP'
    }, {

        type: 'input',
        name: 'projectsPath',
        message: 'Projects path'

    }]).then(answers => {

        jsonfile.writeFile(DIR + '/config.json', answers, function (error) {

            if(error){

                console.error('Unable to write config', error);
                process.exit();
            }

            start();
        })
    });
}
else {

    start();
}


function start() {

    var config;
    var vagrantFilePath;
    var project = null;

    promisify(fs.readFile, fs)(DIR + '/config.json', 'utf8').then((configContent) => {

        config = JSON.parse(configContent);

        vagrantFilePath = config.vagrantPath + '/Vagrantfile';

        return inquirer.prompt([{

            type: 'input',
            name: 'name',
            message: 'Project name'

        }, {
            type: 'input',
            name: 'projectPath',
            message: 'Project path (local)',
            default: answers => {
                return config.projectsPath + '/' + answers.name;
            }

        }, {
            type: 'input',
            name: 'vagrantPath',
            message: 'Project path (Vagrant)',
            default: answers => {
                return '/vagrant/' + answers.name;
            }

        }, {
            type: 'input',
            name: 'domain',
            message: 'Domain',
            default: answers => {
                return answers.name + '.vagrantserver.com'
            }

        }, {
            type: 'input',
            name: 'php',
            message: 'PHP version'
        }]);

    }).then(answers => {

        project = answers;
        project.php = answers.php.replace('.', '');

        return promisify(fs.readFile, fs)(vagrantFilePath, 'utf8');

    }).then(vagrantfile => {

        const startKey = '#sync-start';
        const syncStart = vagrantfile.indexOf(startKey) + startKey.length;

        const syncLine = `config.vm.synced_folder "${project.projectPath}", "${project.vagrantPath}", type: "nfs"`;

        const newVagrantfile = [vagrantfile.slice(0, syncStart), "\n"+syncLine, vagrantfile.slice(syncStart)].join('');

        console.log('Writing Vagrantfile');
        return promisify(fs.writeFile, fs)(vagrantFilePath, newVagrantfile, { flag: 'w+' });

    }).then(() => {

        return promisify(fs.readFile, fs)(DIR + '/data/host.conf.template', 'utf8');

    }).then(hostTemplate => {

        console.log('Writing Apache config');

        const hostConfig = Mustache.render(hostTemplate, project);
        return promisify(fs.writeFile, fs)(`${config.configPath}/${project.name}.conf`, hostConfig, { flag: 'w' });

    }).then(() => {

        return exec(`echo "${config.vagrantIp}  ${project.domain}" | sudo tee -a /etc/hosts`);

    }).then(() => {

        console.log('Reloading Vagrant');
        return exec(`cd ${config.vagrantPath}; vagrant reload;`);

    }).then(() => {

        console.log('Restarting Apache');
        return exec(`cd ${config.vagrantPath}; vagrant ssh -c "sudo service httpd restart";`);

    }).then(() => {

        console.log('DONE');

    }).catch(error => {

        console.error(error);
    });
}