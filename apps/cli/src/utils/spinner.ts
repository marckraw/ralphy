import ora, { type Ora } from 'ora';

export interface SpinnerInstance {
  start: (text?: string) => SpinnerInstance;
  stop: () => SpinnerInstance;
  succeed: (text?: string) => SpinnerInstance;
  fail: (text?: string) => SpinnerInstance;
  warn: (text?: string) => SpinnerInstance;
  info: (text?: string) => SpinnerInstance;
  text: (text: string) => SpinnerInstance;
}

function createSpinnerWrapper(oraInstance: Ora): SpinnerInstance {
  return {
    start(text?: string): SpinnerInstance {
      oraInstance.start(text);
      return this;
    },
    stop(): SpinnerInstance {
      oraInstance.stop();
      return this;
    },
    succeed(text?: string): SpinnerInstance {
      oraInstance.succeed(text);
      return this;
    },
    fail(text?: string): SpinnerInstance {
      oraInstance.fail(text);
      return this;
    },
    warn(text?: string): SpinnerInstance {
      oraInstance.warn(text);
      return this;
    },
    info(text?: string): SpinnerInstance {
      oraInstance.info(text);
      return this;
    },
    text(text: string): SpinnerInstance {
      oraInstance.text = text;
      return this;
    },
  };
}

export function createSpinner(text?: string): SpinnerInstance {
  const oraInstance = text !== undefined
    ? ora({ text, spinner: 'dots' })
    : ora({ spinner: 'dots' });
  return createSpinnerWrapper(oraInstance);
}

export async function withSpinner<T>(
  text: string,
  fn: () => Promise<T>,
  options?: { successText?: string; failText?: string }
): Promise<T> {
  const spinner = createSpinner(text).start();
  try {
    const result = await fn();
    spinner.succeed(options?.successText ?? text);
    return result;
  } catch (err) {
    spinner.fail(options?.failText ?? text);
    throw err;
  }
}
