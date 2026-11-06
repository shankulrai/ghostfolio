import { UserService } from '@ghostfolio/client/services/user/user.service';
import { CorporateActionEntry, User } from '@ghostfolio/common/interfaces';
import { GfCorporateActionsTableComponent } from '@ghostfolio/ui/corporate-actions-table';
import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    GfCorporateActionsTableComponent,
    MatFormFieldModule,
    MatPaginatorModule,
    MatSelectModule,
    ReactiveFormsModule
  ],
  selector: 'gf-admin-corporate-actions',
  styleUrls: ['./admin-corporate-actions.component.scss'],
  templateUrl: './admin-corporate-actions.component.html'
})
export class GfAdminCorporateActionsComponent implements OnInit {
  protected entries: CorporateActionEntry[] = [];
  protected failedCount = 0;
  protected pageIndex = 0;
  protected readonly pageSize = 50;
  protected stalePendingCount = 0;
  protected totalItems = 0;
  protected user: User;

  protected readonly filterForm = new FormGroup({
    status: new FormControl<string | null>(null)
  });

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly dataService = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly userService = inject(UserService);

  public ngOnInit() {
    this.userService.stateChanged
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state?.user) {
          this.user = state.user;

          this.fetchData();

          this.changeDetectorRef.markForCheck();
        }
      });

    this.filterForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.pageIndex = 0;
        this.fetchData();
      });
  }

  protected onChangePage(page: PageEvent) {
    this.pageIndex = page.pageIndex;
    this.fetchData();
  }

  private fetchData() {
    this.dataService
      .fetchAdminCorporateActions({
        skip: this.pageIndex * this.pageSize,
        take: this.pageSize
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ entries, failedCount, stalePendingCount, total }) => {
        this.entries = entries;
        this.failedCount = failedCount ?? 0;
        this.stalePendingCount = stalePendingCount ?? 0;
        this.totalItems = total;

        this.changeDetectorRef.markForCheck();
      });
  }
}
