import AsyncStorage from '@react-native-async-storage/async-storage';
import {loadDataResult} from '../store/storage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(), setItem: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

test('web tasks without subtasks load safely without rewriting stored data', async () => {
  const records = [{id: 'missing', title: 'Web task', projectId: 'p'}, {id: 'null', subtasks: null}, {id: 'existing', subtasks: [{id: 's', title: 'Keep'}]}];
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(records));
  expect(await loadDataResult('tasks', [])).toEqual({ok: true, found: true, value: [
    {...records[0], subtasks: []}, {...records[1], subtasks: []}, records[2],
  ]});
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
});

test('other collections retain their original shape', async () => {
  const records = [{id: 'p', title: 'Project'}];
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(records));
  expect(await loadDataResult('projects', [])).toEqual({ok: true, found: true, value: records});
});
