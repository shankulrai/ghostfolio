import { getLocale } from '@ghostfolio/common/helper';
import { CorporateActionEntry } from '@ghostfolio/common/interfaces';

import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  viewChild
} from '@angular/core';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatSortModule, MatTableModule, NgxSkeletonLoaderModule],
  selector: 'gf-corporate-actions-table',
  styleUrls: ['./corporate-actions-table.component.scss'],
  templateUrl: './corporate-actions-table.component.html'
})
export class GfCorporateActionsTableComponent {
  public readonly entries = input.required<
    CorporateActionEntry[] | undefined
  >();

  public readonly locale = input(getLocale(), {
    transform: (value?: string) => {
      return value ?? getLocale();
    }
  });

  public readonly showCounts = input(false);

  public readonly sort = viewChild.required(MatSort);

  protected dataSource = new MatTableDataSource<CorporateActionEntry>();

  protected displayedColumns = [
    'effectiveDate',
    'symbol',
    'type',
    'ratio',
    'status'
  ];

  public constructor() {
    effect(() => {
      if (this.showCounts()) {
        this.displayedColumns = [
          'effectiveDate',
          'symbol',
          'type',
          'ratio',
          'status',
          'counts'
        ];
      }

      this.dataSource = new MatTableDataSource(this.entries() ?? []);
      this.dataSource.sort = this.sort();
    });
  }
}
