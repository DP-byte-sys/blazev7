import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { setLogSink } from '../lib/logger';

setLogSink(() => {}); // keep test output clean; logger tests use their own sinks

afterEach(() => cleanup());
