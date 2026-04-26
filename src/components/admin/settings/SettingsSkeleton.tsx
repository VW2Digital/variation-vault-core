import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface SettingsSkeletonProps {
  /** Number of card blocks to render. */
  cards?: number;
  /** Fields per card. */
  fieldsPerCard?: number;
  /** Show the back-button + title placeholder. */
  showHeader?: boolean;
}

/**
 * Skeleton placeholder for any settings subpage.
 * Replaces the old plain-text "Carregando..." with a structure that
 * mirrors the real layout, dramatically improving perceived speed.
 */
const SettingsSkeleton = ({
  cards = 2,
  fieldsPerCard = 3,
  showHeader = true,
}: SettingsSkeletonProps) => {
  return (
    <div className="space-y-6 w-full">
      {showHeader && (
        <div className="flex items-start gap-3 mb-6">
          <Skeleton className="h-9 w-9 rounded-md shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-3 w-72" />
          </div>
        </div>
      )}

      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i} className="border-border/50">
          <CardHeader>
            <Skeleton className="h-5 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: fieldsPerCard }).map((__, j) => (
              <div key={j} className="space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Skeleton className="h-10 w-32" />
    </div>
  );
};

export default SettingsSkeleton;