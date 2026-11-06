import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

@Component({
  selector: 'gf-fallback-rate-indicator',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
  templateUrl: './fallback-rate-indicator.component.html'
})
export class GfFallbackRateIndicatorComponent {
  @Input() fallbackUsed = false;
  @Input() fallbackDate: Date | undefined;
}
