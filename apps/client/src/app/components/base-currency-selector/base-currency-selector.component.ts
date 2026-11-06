import { SUPPORTED_BASE_CURRENCIES } from '@ghostfolio/common/config';

import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'gf-base-currency-selector',
  standalone: true,
  imports: [CommonModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './base-currency-selector.component.html',
  styleUrls: ['./base-currency-selector.component.scss']
})
export class GfBaseCurrencySelectorComponent {
  @Input() selectedCurrency: string;
  @Input() disabled = false;

  @Output() currencyChange = new EventEmitter<string>();

  public currencies = [...SUPPORTED_BASE_CURRENCIES];

  public onCurrencyChange(currency: string): void {
    this.currencyChange.emit(currency);
  }
}
