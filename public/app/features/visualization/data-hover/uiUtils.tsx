import { cx } from '@emotion/css';
import React from 'react';

const isUrl = (url: string) => {
  try {
    const newUrl = new URL(url);
    return newUrl.protocol.includes('http');
  } catch (_) {
    return false;
  }
};

export const renderValue = (value: string): string | React.ReactNode => {
  if (isUrl(value)) {
    return (
      <a href={value} target={'_blank'} className={cx('external-link')} rel="noreferrer">
        {value}
      </a>
    );
  }

  return value;
};
