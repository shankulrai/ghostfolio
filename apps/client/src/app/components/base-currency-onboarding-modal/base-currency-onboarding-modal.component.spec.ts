import { DataService } from '@ghostfolio/ui/services';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';

import { PortfolioFacadeService } from '../../services/portfolio-facade/portfolio-facade.service';
import { GfBaseCurrencySelectorComponent } from '../base-currency-selector/base-currency-selector.component';
import { GfBaseCurrencyOnboardingModalComponent } from './base-currency-onboarding-modal.component';

describe('GfBaseCurrencyOnboardingModalComponent', () => {
  let component: GfBaseCurrencyOnboardingModalComponent;
  let fixture: ComponentFixture<GfBaseCurrencyOnboardingModalComponent>;
  let dataService: { putUserSetting: jest.Mock };
  let portfolioFacadeService: {
    createPortfolio: jest.Mock;
    getPortfolios: jest.Mock;
    updateBaseCurrency: jest.Mock;
  };
  let dialogRef: { close: jest.Mock };
  let snackBar: { open: jest.Mock };

  const mockPortfolio = {
    id: 'portfolio-1',
    userId: 'user-1',
    name: 'Default',
    baseCurrency: 'USD',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  beforeEach(async () => {
    dataService = {
      putUserSetting: jest.fn().mockReturnValue(of({}))
    };
    portfolioFacadeService = {
      createPortfolio: jest.fn(),
      getPortfolios: jest.fn().mockReturnValue(of([mockPortfolio])),
      updateBaseCurrency: jest.fn()
    };
    dialogRef = { close: jest.fn() };
    snackBar = { open: jest.fn() };

    TestBed.overrideProvider(MatSnackBar, { useValue: snackBar });

    await TestBed.configureTestingModule({
      imports: [
        GfBaseCurrencyOnboardingModalComponent,
        GfBaseCurrencySelectorComponent,
        MatButtonModule,
        MatDialogModule,
        MatSnackBarModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: DataService, useValue: dataService },
        { provide: PortfolioFacadeService, useValue: portfolioFacadeService },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MatSnackBar, useValue: snackBar }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GfBaseCurrencyOnboardingModalComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load the first portfolio on init', () => {
    component.ngOnInit();

    expect(portfolioFacadeService.getPortfolios).toHaveBeenCalled();
    expect(component.selectedCurrency).toBe('USD');
  });

  it('should default to USD without an error when no portfolio exists', () => {
    portfolioFacadeService.getPortfolios.mockReturnValue(of([]));

    component.ngOnInit();

    expect(component.selectedCurrency).toBe('USD');
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('should show an error when the portfolio cannot be loaded', () => {
    portfolioFacadeService.getPortfolios.mockReturnValue(
      throwError(() => new Error('Failed to load'))
    );

    component.ngOnInit();

    expect(snackBar.open).toHaveBeenCalledWith(
      'Failed to load portfolio. Please try again.',
      'Dismiss',
      { duration: 5000 }
    );
  });

  it('should update selected currency on change', () => {
    component.onCurrencyChange('EUR');

    expect(component.selectedCurrency).toBe('EUR');
  });

  it('should disable submit when no currency is selected', () => {
    component.selectedCurrency = null;

    expect(component.isSubmitDisabled).toBe(true);
  });

  it('should disable submit while submitting', () => {
    component.selectedCurrency = 'USD';
    component.isSubmitting = true;

    expect(component.isSubmitDisabled).toBe(true);
  });

  it('should record consent before updating an existing portfolio', () => {
    portfolioFacadeService.updateBaseCurrency.mockReturnValue(
      of({ ...mockPortfolio, baseCurrency: 'EUR' })
    );

    component.ngOnInit();
    component.onCurrencyChange('EUR');
    component.onSubmit();

    expect(dataService.putUserSetting).toHaveBeenCalledWith({
      isBaseCurrencyConsentGiven: true
    });
    expect(portfolioFacadeService.updateBaseCurrency).toHaveBeenCalledWith(
      'portfolio-1',
      'EUR'
    );
    expect(portfolioFacadeService.createPortfolio).not.toHaveBeenCalled();
    expect(dialogRef.close).toHaveBeenCalledWith({ success: true });
  });

  it('should create the portfolio after consent when none exists', () => {
    portfolioFacadeService.getPortfolios.mockReturnValue(of([]));
    portfolioFacadeService.createPortfolio.mockReturnValue(
      of({ ...mockPortfolio, baseCurrency: 'EUR' })
    );

    component.ngOnInit();
    component.onCurrencyChange('EUR');
    component.onSubmit();

    expect(dataService.putUserSetting).toHaveBeenCalledWith({
      isBaseCurrencyConsentGiven: true
    });
    expect(portfolioFacadeService.createPortfolio).toHaveBeenCalledWith(
      'Default',
      'EUR'
    );
    expect(dialogRef.close).toHaveBeenCalledWith({ success: true });
  });

  it('should not save consent when portfolio save fails', () => {
    portfolioFacadeService.updateBaseCurrency.mockReturnValue(
      throwError(() => new Error('Update failed'))
    );

    component.ngOnInit();
    component.onCurrencyChange('EUR');
    component.onSubmit();

    expect(portfolioFacadeService.updateBaseCurrency).toHaveBeenCalled();
    expect(dataService.putUserSetting).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(component.isSubmitting).toBe(false);
  });

  it('should stay open and show an error when the save fails', () => {
    portfolioFacadeService.updateBaseCurrency.mockReturnValue(
      throwError(() => new Error('Update failed'))
    );

    component.ngOnInit();
    component.onCurrencyChange('EUR');
    component.onSubmit();

    expect(snackBar.open).toHaveBeenCalledWith(
      'Failed to save base currency. Please try again.',
      'Dismiss',
      { duration: 5000 }
    );
    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(component.isSubmitting).toBe(false);
  });
});
