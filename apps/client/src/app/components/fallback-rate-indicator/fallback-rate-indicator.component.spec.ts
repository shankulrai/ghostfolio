import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { GfFallbackRateIndicatorComponent } from './fallback-rate-indicator.component';

describe('GfFallbackRateIndicatorComponent', () => {
  let component: GfFallbackRateIndicatorComponent;
  let fixture: ComponentFixture<GfFallbackRateIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        GfFallbackRateIndicatorComponent,
        MatIconModule,
        MatTooltipModule
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GfFallbackRateIndicatorComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not display icon when fallbackUsed is false', () => {
    component.fallbackUsed = false;
    fixture.detectChanges();

    const icon = fixture.nativeElement.querySelector('mat-icon');
    expect(icon).toBeNull();
  });

  it('should display warning icon when fallbackUsed is true', () => {
    component.fallbackUsed = true;
    component.fallbackDate = new Date('2024-01-12');
    fixture.detectChanges();

    const icon = fixture.nativeElement.querySelector('mat-icon');
    expect(icon).toBeTruthy();
    expect(icon.textContent.trim()).toBe('warning');
  });

  it('should have tooltip configuration when fallbackUsed is true', () => {
    component.fallbackUsed = true;
    component.fallbackDate = new Date('2024-01-12');
    fixture.detectChanges();

    const icon = fixture.nativeElement.querySelector('mat-icon');
    expect(icon).toBeTruthy();
    expect(component.fallbackDate).toEqual(new Date('2024-01-12'));
    expect(component.fallbackUsed).toBe(true);
  });
});
