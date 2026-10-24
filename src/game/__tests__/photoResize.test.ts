import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useAiPhotoStore } from '../../store/useAiPhotoStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: jest.fn(async () => 'T1JJR0lOQUw='),
}));

let mockDims = { width: 4000, height: 3000 };
const mockResize = jest.fn();
const mockManipulate = jest.fn(() => ({
  resize: mockResize,
  renderAsync: async () => ({ ...mockDims, saveAsync: async () => ({ base64: 'U01BTEw=' }) }),
}));
let mockManipulatorFails = false;
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: (...a: unknown[]) => {
      if (mockManipulatorFails) throw new Error('boom');
      return (mockManipulate as (...x: unknown[]) => unknown)(...a);
    },
  },
}));

import { AI_FULL_HD_EDGE_PX, AI_MAX_EDGE_PX, imageUriToBase64 } from '../../utils/photoStorage';

beforeEach(() => {
  mockResize.mockClear();
  mockManipulatorFails = false;
  mockDims = { width: 4000, height: 3000 };
});

describe('imageUriToBase64 downscaling', () => {
  it('shrinks a landscape photo by width to the default edge and returns a JPEG', async () => {
    const out = await imageUriToBase64('file:///a.jpg');
    expect(mockResize).toHaveBeenCalledWith({ width: AI_MAX_EDGE_PX });
    expect(out).toEqual({ base64: 'U01BTEw=', mediaType: 'image/jpeg' });
  });

  it('shrinks a portrait photo by height', async () => {
    mockDims = { width: 3000, height: 4000 };
    await imageUriToBase64('file:///a.jpg');
    expect(mockResize).toHaveBeenCalledWith({ height: AI_MAX_EDGE_PX });
  });

  it('uses the larger Full HD edge when asked', async () => {
    await imageUriToBase64('file:///a.jpg', { maxEdge: AI_FULL_HD_EDGE_PX });
    expect(mockResize).toHaveBeenCalledWith({ width: 1920 });
    expect(AI_FULL_HD_EDGE_PX).toBeGreaterThan(AI_MAX_EDGE_PX);
  });

  it('never enlarges a photo that is already small', async () => {
    mockDims = { width: 800, height: 600 };
    await imageUriToBase64('file:///a.jpg');
    expect(mockResize).not.toHaveBeenCalled();
  });

  it('falls back to the original file if resizing fails', async () => {
    mockManipulatorFails = true;
    const out = await imageUriToBase64('file:///a.png');
    expect(out).toEqual({ base64: 'T1JJR0lOQUw=', mediaType: 'image/png' });
  });
});

describe('useAiPhotoStore', () => {
  it('defaults to the small size and can be switched on', () => {
    expect(useAiPhotoStore.getState().fullHd).toBe(false);
    useAiPhotoStore.getState().setFullHd(true);
    expect(useAiPhotoStore.getState().fullHd).toBe(true);
    useAiPhotoStore.getState().setFullHd(false);
  });
});
