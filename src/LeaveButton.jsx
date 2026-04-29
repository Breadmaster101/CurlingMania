import { LogOut } from 'lucide-react';
import { store } from './store';

export default function LeaveButton() {
    return (
        <button 
            className="leave-btn"
            onClick={() => store.leaveRoom()}
            title="Return to Main Menu"
        >
            <LogOut size={16} />
            <span>Leave</span>
        </button>
    );
}
