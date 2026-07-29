/**
 * Migration script: Backfill User.profileCompletedAt for existing users
 *
 * Scans data/learning/{userId}/profile.json files and marks users
 * as profile-complete if their dimensions meet the threshold (6/8 filled).
 *
 * Run: npx tsx scripts/migrate-profile-completed.ts
 */

import { PrismaClient } from '../node_modules/@prisma/client';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

// Inline the completeness check to avoid @/ path alias issues
interface ProfileDimensionsLike {
  knowledgeBase?: { subjects?: Array<Record<string, unknown>> };
  cognitiveStyle?: { type?: string; preference?: string };
  learningGoals?: { shortTerm?: string[]; longTerm?: string };
  weakPoints?: { topics?: string[]; errorPatterns?: string[] };
  timePreference?: { preferredDuration?: number; preferredTimeSlot?: string };
  interests?: { domains?: string[]; preferredFormats?: string[] };
  learningPace?: { speed?: string };
  errorPatterns?: { commonMistakes?: string[]; difficultAreas?: string[] };
}

function getFilledDimensionsCount(d: ProfileDimensionsLike | null | undefined): number {
  if (!d) return 0;
  let count = 0;
  if (d.knowledgeBase?.subjects?.length && d.knowledgeBase.subjects.length > 0) count++;
  if (d.cognitiveStyle?.type && d.cognitiveStyle.type !== 'reading') count++;
  if (d.learningGoals?.shortTerm?.length && d.learningGoals.shortTerm.length > 0 || !!d.learningGoals?.longTerm) count++;
  if (d.weakPoints?.topics?.length && d.weakPoints.topics.length > 0 || (d.weakPoints?.errorPatterns?.length ?? 0) > 0) count++;
  if ((d.timePreference?.preferredDuration ?? 0) > 0) count++;
  if (d.interests?.domains?.length && d.interests.domains.length > 0) count++;
  if (d.learningPace?.speed && d.learningPace.speed !== 'moderate') count++;
  if (d.errorPatterns?.commonMistakes?.length && d.errorPatterns.commonMistakes.length > 0 || (d.errorPatterns?.difficultAreas?.length ?? 0) > 0) count++;
  return count;
}

function isProfileComplete(d: ProfileDimensionsLike | null | undefined): boolean {
  return getFilledDimensionsCount(d) >= 6;
}

const prisma = new PrismaClient();
const DATA_DIR = join(process.cwd(), 'data', 'learning');

async function migrate() {
  if (!existsSync(DATA_DIR)) {
    console.log('No data/learning directory found. Nothing to migrate.');
    return;
  }

  const userDirs = readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  console.log(`Found ${userDirs.length} user directories.`);

  let updated = 0;
  let skipped = 0;

  for (const userId of userDirs) {
    // Skip users already marked as complete
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      console.log(`  [SKIP] ${userId}: no User record in DB`);
      skipped++;
      continue;
    }
    if (user.profileCompletedAt) {
      console.log(`  [SKIP] ${userId}: already has profileCompletedAt`);
      skipped++;
      continue;
    }

    const profilePath = join(DATA_DIR, userId, 'profile.json');
    try {
      const raw = readFileSync(profilePath, 'utf-8');
      const profile = JSON.parse(raw) as { dimensions?: ProfileDimensionsLike };

      // Handle both { dimensions: {...} } and flat dimension structures
      const dimensions = profile.dimensions ?? profile;

      if (isProfileComplete(dimensions as ProfileDimensionsLike)) {
        await prisma.user.update({
          where: { id: userId },
          data: { profileCompletedAt: new Date() },
        });
        console.log(`  [DONE] ${userId}: marked as profile-complete`);
        updated++;
      } else {
        console.log(`  [SKIP] ${userId}: profile incomplete (${getFilledDimensionsCount(dimensions as ProfileDimensionsLike)}/8 dimensions)`);
        skipped++;
      }
    } catch {
      console.log(`  [SKIP] ${userId}: profile.json missing or invalid`);
      skipped++;
    }
  }

  console.log(`\nMigration complete. Updated: ${updated}, Skipped: ${skipped}`);
}

migrate()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
