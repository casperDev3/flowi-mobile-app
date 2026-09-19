/**
 * utils/uuid.ts — UUID v4 без нативної залежності.
 *
 * `crypto.randomUUID()` немає в Hermes без поліфілу (той самий факт, що
 * пояснює `newSprintId()` в utils/sprintUtils.ts), а контракт (§0.5) прямо
 * вимагає саме формат uuid4 для нових id проєктів (`p-<uuid4>`), а не
 * довільний унікальний рядок, як у sprint/status id.
 */
export function uuidV4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const r = (Math.random() * 16) | 0;
    return (char === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
