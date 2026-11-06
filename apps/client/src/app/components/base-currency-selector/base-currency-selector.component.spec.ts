import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { GfBaseCurrencySelectorComponent } from './base-currency-selector.component';

describe('GfBaseCurrencySelectorComponent', () => {
  let component: GfBaseCurrencySelectorComponent;
  let fixture: ComponentFixture<GfBaseCurrencySelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        GfBaseCurrencySelectorComponent,
        MatFormFieldModule,
        MatSelectModule,
        NoopAnimationsModule
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GfBaseCurrencySelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render 5 currency options', () => {
    expect(component.currencies.length).toBe(5);
    expect(component.currencies).toContain('USD');
    expect(component.currencies).toContain('EUR');
    expect(component.currencies).toContain('GBP');
    expect(component.currencies).toContain('CHF');
    expect(component.currencies).toContain('INR');
  });

  it('should emit currencyChange event on selection', () => {
    const emitSpy = jest.spyOn(component.currencyChange, 'emit');

    component.onCurrencyChange('EUR');

    expect(emitSpy).toHaveBeenCalledWith('EUR');
  });

  it('should pre-select current base currency', () => {
    component.selectedCurrency = 'USD';
    fixture.detectChanges();

    expect(component.selectedCurrency).toBe('USD');
  });

  it('should handle disabled state', () => {
    component.disabled = true;
    fixture.detectChanges();

    expect(component.disabled).toBe(true);
  });

  it('should not be disabled by default', () => {
    expect(component.disabled).toBe(false);
  });
});
