/**
 * components/training/importPersonal.ts — міст «особисте → група» (§7.3):
 * разова дія тренера, не міграція. Особисті записи лише ЧИТАЮТЬСЯ; у групу
 * лягають копії з `sourceExerciseId`, щоб повторний імпорт не дублював.
 */
import { loadDataResult } from '@/store/storage';
import {
  exerciseFromPersonal,
  programFromPersonal,
  type PersonalExercise,
  type PersonalProgram,
} from '@/utils/trainingPrograms';
import { newTrainingId } from '@/utils/trainingSync';
import type { TrainingExercise, TrainingProgram } from '@/utils/trainingTypes';

export async function readPersonalExercises(): Promise<PersonalExercise[] | null> {
  const res = await loadDataResult<unknown>('exercises', []);
  if (!res.ok) return null;
  return Array.isArray(res.value)
    ? (res.value as PersonalExercise[]).filter(e => e && typeof e.id === 'string' && typeof e.name === 'string')
    : [];
}

export async function readPersonalPrograms(): Promise<PersonalProgram[] | null> {
  const res = await loadDataResult<unknown>('workout_programs', []);
  if (!res.ok) return null;
  return Array.isArray(res.value)
    ? (res.value as PersonalProgram[]).filter(p => p && typeof p.id === 'string' && Array.isArray(p.exerciseIds))
    : [];
}

/** Нові групові вправи для особистих, яких у групі ще немає. */
export function exercisesToImport(
  personal: readonly PersonalExercise[],
  existing: readonly TrainingExercise[],
  onlyIds?: ReadonlySet<string>,
): TrainingExercise[] {
  const imported = new Set(existing.map(e => e.sourceExerciseId).filter(Boolean));
  return personal
    .filter(p => !imported.has(p.id) && (!onlyIds || onlyIds.has(p.id)))
    .map(p => exerciseFromPersonal(p, newTrainingId('te')));
}

/** Програма + вправи, яких бракує, для одного особистого WorkoutProgram. */
export function importProgramPlan(
  program: PersonalProgram,
  personal: readonly PersonalExercise[],
  existing: readonly TrainingExercise[],
): { exercises: TrainingExercise[]; program: TrainingProgram } {
  const byId = new Map(personal.map(p => [p.id, p]));
  const fresh = exercisesToImport(personal, existing, new Set(program.exerciseIds));
  const all = [...existing, ...fresh];
  const map = new Map<string, TrainingExercise>();
  for (const ex of all) if (ex.sourceExerciseId) map.set(ex.sourceExerciseId, ex);
  return { exercises: fresh, program: programFromPersonal(program, newTrainingId('tp'), map, byId) };
}
