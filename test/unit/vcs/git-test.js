import {Branch as gitBranch, Remote as gitRemote, Repository as gitRepository} from 'nodegit';
import fs from 'mz/fs';
import any from '@travi/any';
import sinon from 'sinon';
import {assert} from 'chai';
import {initialize, scaffold} from '../../../src/vcs/git';
import * as prompts from '../../../src/prompts/questions';
import {questionNames} from '../../../src/prompts/question-names';

suite('scaffold git', () => {
  let sandbox;
  const projectRoot = any.string();
  const visibility = any.word();

  setup(() => {
    sandbox = sinon.createSandbox();

    sandbox.stub(fs, 'writeFile');
    sandbox.stub(gitRepository, 'init');
    sandbox.stub(gitRepository, 'open');
    sandbox.stub(gitRemote, 'create');
    sandbox.stub(gitRemote, 'list');
    sandbox.stub(gitBranch, 'lookup');
    sandbox.stub(gitBranch, 'setUpstream');
    sandbox.stub(prompts, 'promptForVcsHostDetails');

    gitRepository.init.resolves();
  });

  teardown(() => sandbox.restore());

  suite('initialization', () => {
    test('that the git repo is initialized', async () => {
      const repoHost = any.word();
      const repoOwner = any.word();
      const projectName = any.word();
      const vcsHosts = any.simpleObject();
      prompts.promptForVcsHostDetails
        .withArgs(vcsHosts, visibility)
        .resolves({[questionNames.REPO_HOST]: repoHost, [questionNames.REPO_OWNER]: repoOwner});

      const hostDetails = await initialize(true, projectRoot, projectName, vcsHosts, visibility);

      assert.calledWith(gitRepository.init, projectRoot, 0);
      assert.deepEqual(hostDetails, {host: repoHost, owner: repoOwner, name: projectName});
    });

    test('that the git repo is not initialized if it shouldnt be', async () => {
      const repoHost = any.word();
      const repoOwner = any.word();
      const githubAccount = any.word();
      const projectName = any.word();
      prompts.promptForVcsHostDetails
        .withArgs(githubAccount)
        .resolves({[questionNames.REPO_HOST]: repoHost, [questionNames.REPO_OWNER]: repoOwner});

      const hostDetails = await initialize(false, projectRoot, projectName, githubAccount);

      assert.notCalled(gitRepository.init);
      assert.isUndefined(hostDetails);
    });
  });

  suite('scaffold', () => {
    const repository = any.simpleObject();

    setup(() => {
      gitRepository.open.withArgs(projectRoot).resolves(repository);
      gitRemote.list.withArgs(repository).resolves(any.listOf(any.word));
    });

    test('that the git repo is initialized', () => {
      fs.writeFile.resolves();

      return scaffold({projectRoot, origin: {}}).then(() => {
        assert.calledWith(fs.writeFile, `${projectRoot}/.gitattributes`, '* text=auto');
        assert.neverCalledWith(fs.writeFile, `${projectRoot}/.gitignore`);
        assert.notCalled(gitRemote.create);
      });
    });

    test('that ignore file is created when patterns are defined', () => {
      const directories = any.listOf(any.string);
      const files = any.listOf(any.string);
      fs.writeFile.resolves();

      return scaffold({projectRoot, ignore: {directories, files}, origin: {}}).then(() => assert.calledWith(
        fs.writeFile,
        `${projectRoot}/.gitignore`,
        `${directories.join('\n')}\n\n${files.join('\n')}`
      ));
    });

    test('that the remote origin is defined when an ssl-url is provided for the remote', async () => {
      const sshUrl = any.url();
      const branch = any.simpleObject();
      gitBranch.lookup.withArgs(repository, 'master', gitBranch.BRANCH.LOCAL).resolves(branch);
      gitRemote.create.resolves();
      gitBranch.setUpstream.resolves();

      await scaffold({projectRoot, origin: {sshUrl}});

      assert.calledWith(gitRemote.create, repository, 'origin', sshUrl);
      assert.calledWith(gitBranch.setUpstream, branch, 'origin/master');
    });

    test('that the remote origin is not defined if it already exists', async () => {
      const sshUrl = any.url();
      gitRemote.list.withArgs(repository).resolves(['origin']);

      await scaffold({projectRoot, origin: {sshUrl}});

      assert.notCalled(gitRemote.create);
      assert.notCalled(gitBranch.lookup);
      assert.notCalled(gitBranch.setUpstream);
    });
  });
});
