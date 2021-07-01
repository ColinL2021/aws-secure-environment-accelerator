import { AccountStacks } from '../../common/account-stacks';
import { AcceleratorConfig } from '@aws-accelerator/common-config/src';
import { SecretsContainer } from '@aws-accelerator/cdk-accelerator/src/core/secrets-container';
import { StructuredOutput } from '../../common/structured-output';
import { SecretEncryptionKeyOutput, SecretEncryptionKeyOutputType } from './outputs';
import { randomAlphanumericString } from '@aws-accelerator/common/src/util/common';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import { createName } from '@aws-accelerator/cdk-accelerator/src/core/accelerator-name-generator';
import { CfnDynamicSecretOutput } from '../mad';

export interface SecretsStep1Props {
  accountStacks: AccountStacks;
  config: AcceleratorConfig;
}

export async function step1(props: SecretsStep1Props) {
  const { accountStacks, config } = props;

  const masterAccountKey = config.getMandatoryAccountKey('master');
  const masterAccountStack = accountStacks.getOrCreateAccountStack(masterAccountKey);

  // Create secrets for the different deployments
  const secretsContainer = new SecretsContainer(masterAccountStack, 'Secrets');

  new StructuredOutput<SecretEncryptionKeyOutput>(masterAccountStack, 'SecretEncryptionKey', {
    type: SecretEncryptionKeyOutputType,
    value: {
      encryptionKeyName: secretsContainer.alias,
      encryptionKeyId: secretsContainer.encryptionKey.keyId,
      encryptionKeyArn: secretsContainer.encryptionKey.keyArn,
    },
  });

  for (const [accountKey, accountConfig] of config.getAccountConfigs()) {
    for (const { name, region, size } of accountConfig.secrets) {
      const accountStack = accountStacks.tryGetOrCreateAccountStack(accountKey, region);
      if (!accountStack) {
        console.warn(`Cannot find account stack ${accountKey}`);
        continue;
      }
      const secretString = randomAlphanumericString(size);
      const secretObj = new secretsmanager.CfnSecret(accountStack, `Dynamic-Secret-${name}`, {
        description: `Secret Created for Userdata Replacement`,
        name: createName({
          name,
          suffixLength: 0,
        }),
        secretString,
      });
      new CfnDynamicSecretOutput(accountStack, `Dynamic-Secret-${name}-Output`, {
        arn: secretObj.ref,
        name,
        value: secretString,
      });
    }
  }

  return {
    secretsContainer,
  };
}
