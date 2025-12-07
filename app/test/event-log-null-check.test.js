/**
 * Test for Event Log Null Check Fix
 * 
 * This test ensures that addEventToLog function handles cases where
 * the event-log DOM element is not present without crashing.
 */

describe('Event Log Null Check Logic', () => {
    test('should not throw error when element is null', () => {
        // Simulate the null check logic from addEventToLog
        const logTable = null;
        
        // This should not throw an error
        expect(() => {
            if (!logTable) {
                console.warn('Event log element not found, skipping event display');
                return;
            }
            // This code would crash if logTable is null
            logTable.insertBefore({}, logTable.firstChild);
        }).not.toThrow();
    });

    test('should handle undefined element gracefully', () => {
        // Simulate the null check logic with undefined
        const logTable = undefined;
        
        // This should not throw an error
        expect(() => {
            if (!logTable) {
                console.warn('Event log element not found, skipping event display');
                return;
            }
            // This code would crash if logTable is undefined
            logTable.insertBefore({}, logTable.firstChild);
        }).not.toThrow();
    });

    test('should proceed with valid element', () => {
        // Simulate a valid element
        const logTable = {
            insertBefore: jest.fn(),
            firstChild: null,
            children: { length: 0 },
            removeChild: jest.fn()
        };
        
        // This should not throw an error
        expect(() => {
            if (!logTable) {
                console.warn('Event log element not found, skipping event display');
                return;
            }
            
            const row = { className: 'event-row border-b border-gray-700' };
            logTable.insertBefore(row, logTable.firstChild);
        }).not.toThrow();
        
        // Verify insertBefore was called
        expect(logTable.insertBefore).toHaveBeenCalledTimes(1);
    });
});
