import { DataSource } from '@ghostfolio/prisma/enums';

export interface CorporateActionEntry {
  appliedCount: number;
  dataSource: DataSource;
  effectiveDate: Date;
  failedCount: number;
  id: string;
  skippedCount: number;
  status: string;
  symbol: string;
  type: string;
}

export interface CorporateActionsResponse {
  entries: CorporateActionEntry[];
  failedCount?: number;
  skip: number;
  stalePendingCount?: number;
  take: number;
  total: number;
}
