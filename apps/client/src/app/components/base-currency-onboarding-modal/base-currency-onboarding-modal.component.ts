import { PortfolioFacadeService } from '@ghostfolio/client/services/portfolio-facade/portfolio-facade.service';
import { DataService } from '@ghostfolio/ui/services';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnInit
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { GfBaseCurrencySelectorComponent } from '../base-currency-selector/base-currency-selector.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    GfBaseCurrencySelectorComponent,
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  selector: 'gf-base-currency-onboarding-modal',
  standalone: true,
  styleUrls: ['./base-currency-onboarding-modal.component.scss'],
  templateUrl: './base-currency-onboarding-modal.component.html'
})
export class GfBaseCurrencyOnboardingModalComponent implements OnInit {
  public selectedCurrency: string;
  public isSubmitting = false;

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly dialogRef = inject(
    MatDialogRef<GfBaseCurrencyOnboardingModalComponent>
  );
  private readonly dataService = inject(DataService);
  private readonly portfolioFacadeService = inject(PortfolioFacadeService);
  private readonly snackBar = inject(MatSnackBar);

  private portfolioId: string | undefined;

  public ngOnInit(): void {
    this.portfolioFacadeService.getPortfolios().subscribe({
      next: ([portfolio]) => {
        this.portfolioId = portfolio?.id;
        this.selectedCurrency = portfolio?.baseCurrency || 'USD';
        this.changeDetectorRef.markForCheck();
      },
      error: () => {
        this.snackBar.open(
          'Failed to load portfolio. Please try again.',
          'Dismiss',
          { duration: 5000 }
        );
      }
    });
  }

  public onCurrencyChange(currency: string): void {
    this.selectedCurrency = currency;
  }

  public onSubmit(): void {
    if (!this.selectedCurrency) {
      return;
    }

    const currency = this.selectedCurrency;

    this.isSubmitting = true;
    this.changeDetectorRef.markForCheck();

    // REQ-012/AC-012b: Save portfolio FIRST, then consent only if portfolio save succeeds
    // This ensures consent is not persisted if portfolio creation fails
    this.savePortfolio(currency)
      .pipe(
        switchMap(() =>
          this.dataService.putUserSetting({ isBaseCurrencyConsentGiven: true })
        )
      )
      .subscribe({
        next: () => {
          this.snackBar.open('Base currency saved successfully', 'Dismiss', {
            duration: 3000
          });
          this.dialogRef.close({ success: true });
        },
        error: () => {
          this.isSubmitting = false;
          this.snackBar.open(
            'Failed to save base currency. Please try again.',
            'Dismiss',
            { duration: 5000 }
          );
          this.changeDetectorRef.markForCheck();
        }
      });
  }

  private savePortfolio(currency: string): Observable<unknown> {
    if (this.portfolioId) {
      return this.portfolioFacadeService.updateBaseCurrency(
        this.portfolioId,
        currency
      );
    }

    return this.portfolioFacadeService.createPortfolio('Default', currency);
  }

  public get isSubmitDisabled(): boolean {
    return !this.selectedCurrency || this.isSubmitting;
  }
}
